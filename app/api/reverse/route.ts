import { NextRequest, NextResponse } from 'next/server';
import { promises as dns } from 'dns';

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

// Получение всех IP адресов из CIDR блока
function expandCIDR(cidr: string): string[] {
  // Упрощенная версия - возвращаем только первый IP из блока
  // Для полной реализации нужна более сложная логика
  const [baseIP, maskBits] = cidr.split('/');
  if (maskBits && parseInt(maskBits) < 32) {
    // Для больших блоков возвращаем только базовый IP
    return [baseIP];
  }
  return [baseIP];
}

// Reverse DNS lookup для одного IP
async function reverseDNSLookup(ip: string): Promise<ReverseDNSResult> {
  try {
    const hostnames = await dns.reverse(ip);
    return {
      ip,
      hostnames: hostnames.filter(h => h && h.trim().length > 0)
    };
  } catch (error) {
    return {
      ip,
      hostnames: [],
      error: 'Не удалось найти доменное имя'
    };
  }
}

// Основной обработчик POST запроса
export async function POST(request: NextRequest) {
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
    
    // Выполняем reverse DNS lookup для всех IP адресов
    const results: ReverseDNSResult[] = [];
    
    // Обрабатываем IP параллельно, но с ограничением
    const batchSize = 10;
    for (let i = 0; i < ipsToProcess.length; i += batchSize) {
      const batch = ipsToProcess.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(ip => reverseDNSLookup(ip))
      );
      results.push(...batchResults);
    }
    
    // Фильтруем результаты - оставляем только те, где найдены имена
    const successfulResults = results.filter(r => r.hostnames.length > 0);
    
    const response: ReverseDNSResponse = {
      results,
      total: results.length,
      successful: successfulResults.length
    };
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Reverse DNS error:', error);
    return NextResponse.json(
      { error: 'Внутренняя ошибка сервера' },
      { status: 500 }
    );
  }
}
