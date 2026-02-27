import { NextRequest, NextResponse } from 'next/server';
import { promises as dns } from 'dns';
import { createDefaultCache } from '../../../lib/cache';
import logger from '../../../lib/logger';
import { rateLimit } from '../../../lib/limits';
import runTasksWithRetry from '../../../lib/net/worker';
import { CONFIG } from '../../../lib/config';

interface ReverseDNSResult {
  ip: string;
  hostnames: string[];
  error?: string;
}

interface ReverseDNSResponse {
  results: ReverseDNSResult[];
  total: number;
  successful: number;
}

// Функция для парсинга IP адресов из текста с командами route add
function extractIPsFromText(text: string): string[] {
  const ips = new Set<string>();
  const lines = text.split('\n');
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Парсинг команд route add (Windows)
    if (trimmedLine.toLowerCase().startsWith('route add')) {
      // Формат: route add IP_ADDRESS mask MASK GATEWAY
      const match = trimmedLine.match(/route\s+add\s+([\d.]+)/i);
      if (match) {
        const ip = match[1];
        // Пропускаем шлюз 0.0.0.0 и явно невалидные IP
        if (ip !== '0.0.0.0' && isValidIP(ip)) {
          ips.add(ip);
        }
      }
    }
    // Также поддержка простого списка IP адресов (по одному на строку)
    else if (/^[\d.]+$/.test(trimmedLine) && isValidIP(trimmedLine)) {
      ips.add(trimmedLine);
    }
  }
  
  return Array.from(ips);
}

// Проверка валидности IP адреса
function isValidIP(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  
  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num < 0 || num > 255) return false;
  }
  
  return true;
}

// Reverse DNS lookup для одного IP
async function reverseDNSLookup(ip: string): Promise<ReverseDNSResult> {
  try {
    const hostnames = await dns.reverse(ip);
    return {
      ip,
      hostnames: hostnames.filter(h => h && h.trim().length > 0)
    };
  } catch {
    return {
      ip,
      hostnames: [],
      error: 'Не удалось найти доменное имя'
    };
  }
}

// Module-level cache singleton
const reverseCache = createDefaultCache<ReverseDNSResult>();

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();

  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const allowed = await rateLimit(clientIp, 'reverse-api');
  if (!allowed) {
    return NextResponse.json({ error: 'Слишком много запросов' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { text, maxIPs = 100 } = body;
    
    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Необходимо предоставить текст с IP адресами' },
        { status: 400 }
      );
    }
    
    // Извлекаем IP адреса из текста
    const ips = extractIPsFromText(text);
    
    if (ips.length === 0) {
      return NextResponse.json(
        { error: 'IP адреса не найдены в предоставленном тексте' },
        { status: 400 }
      );
    }
    
    // Ограничиваем количество IP для обработки
    const ipsToProcess = ips.slice(0, maxIPs);
    
    // Выполняем reverse DNS lookup для всех IP адресов с контролируемой параллельностью и кэшом
    const tasks: Array<() => Promise<ReverseDNSResult>> = ipsToProcess.map((ip) => async () => {
      const key = `reverse:${ip}`;
      const cached = await reverseCache.get(key);
      if (cached) return cached;
      const res = await reverseDNSLookup(ip);
      await reverseCache.set(key, res, CONFIG.TTL.PTR_MS);
      return res;
    });

    logger.info({ requestId, ipCount: ipsToProcess.length }, 'reverse request started');

    const results = await runTasksWithRetry(tasks, { concurrency: CONFIG.CONCURRENCY.DEFAULT, retries: 2 });
    const normalizedResults = results.map((r, i) =>
      r instanceof Error
        ? { ip: ipsToProcess[i], hostnames: [], error: (r as Error).message } as ReverseDNSResult
        : r as ReverseDNSResult
    );

    // Фильтруем результаты - оставляем только те, где найдены имена
    const successfulResults = normalizedResults.filter(r => r.hostnames && r.hostnames.length > 0);

    const response: ReverseDNSResponse = {
      results: normalizedResults,
      total: normalizedResults.length,
      successful: successfulResults.length
    };

    return NextResponse.json(response);

  } catch (error) {
    logger.error({ requestId, error }, 'Reverse DNS error');
    return NextResponse.json(
      { error: 'Внутренняя ошибка сервера' },
      { status: 500 }
    );
  }
}
