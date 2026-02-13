import { NextRequest, NextResponse } from 'next/server';
import { promises as dns } from 'dns';
import { createDefaultCache } from '../../../lib/cache';
import { CONFIG } from '../../../lib/config';
import runTasksWithRetry from '../../../lib/net/worker';
import { fetchWithRetry } from '../../../lib/net/fetchWithRetry';
import { getFromHackertarget, getFromURLScan, getFromAlienVault } from '../../../lib/passiveSources';

interface SubdomainInfo {
  subdomain: string;
  ips: string[];
  source: string;
}

interface DomainCheckResult {
  domain: string;
  subdomains: SubdomainInfo[];
  total: number;
  error?: string;
}

// Расширенный список популярных поддоменов
const COMMON_SUBDOMAINS = [
  'www', 'mail', 'ftp', 'smtp', 'pop', 'pop3', 'imap', 'webmail', 'email',
  'ns', 'ns1', 'ns2', 'ns3', 'ns4', 'dns', 'dns1', 'dns2',
  'admin', 'administrator', 'root', 'cpanel', 'whm', 'panel', 'control',
  'api', 'api1', 'api2', 'rest', 'graphql', 'gateway', 'service', 'services',
  'app', 'mobile', 'm', 'android', 'ios', 'apps', 'play',
  'cdn', 'cdn1', 'cdn2', 'cdn3', 'static', 'assets', 'media', 'images', 'img',
  'video', 'videos', 'photos', 'files', 'download', 'downloads', 'content',
  'css', 'js', 'fonts', 'uploads',
  'shop', 'store', 'cart', 'checkout', 'payment', 'pay', 'orders', 'products',
  'blog', 'news', 'forum', 'community', 'wiki', 'kb', 'help', 'support',
  'docs', 'documentation', 'faq', 'learn', 'tutorial', 'guides',
  'dev', 'development', 'staging', 'stage', 'test', 'testing', 'qa',
  'demo', 'sandbox', 'beta', 'alpha', 'preview', 'uat', 'preprod',
  'analytics', 'stats', 'statistics', 'metrics', 'monitor', 'monitoring',
  'status', 'health', 'logs', 'log', 'grafana', 'kibana',
  'vpn', 'remote', 'secure', 'ssl', 'auth', 'login', 'oauth', 'sso',
  'cloud', 'aws', 'azure', 'gcp', 's3', 'storage',
  'autodiscover', 'autoconfig', 'mx', 'mx1', 'mx2', 'smtp1', 'smtp2',
  'social', 'chat', 'meet', 'conference', 'call', 'webrtc',
  'marketing', 'promo', 'campaign', 'newsletter', 'subscribe',
  'dashboard', 'console', 'portal', 'account', 'my', 'user', 'profile',
  'search', 'www2', 'www3', 'old', 'new', 'v2', 'v3', 'web', 'site',
  'server', 'host', 'node', 'edge', 'origin', 'backup', 'mirror',
  'ads', 'advertising', 'affiliates', 'partners', 'developer', 'developers',
  'careers', 'jobs', 'about', 'contact', 'legal', 'privacy', 'terms'
];

async function checkSubdomain(subdomain: string): Promise<SubdomainInfo | null> {
  try {
    const ips = await dns.resolve4(subdomain);
    return { subdomain, ips, source: 'dns-check' };
  } catch {
    return null;
  }
}

async function getSubdomainsFromCrtSh(domain: string): Promise<SubdomainInfo[]> {
  try {
    const url = `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`;
    const res = await fetchWithRetry(url, undefined, { retries: 2, timeoutMs: CONFIG.HTTP_TIMEOUT_MS });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    const subdomains = new Set<string>();
    for (const cert of data) {
      const names = (cert.name_value || '').split('\n');
      for (const name of names) {
        const cleanName = name.trim().toLowerCase();
        if (cleanName.endsWith(`.${domain}`) && !cleanName.includes('*')) {
          subdomains.add(cleanName);
        }
      }
    }
    const list = Array.from(subdomains).slice(0, 100);
    const tasks = list.map((sub) => async () => {
      try {
        const ips = await dns.resolve4(sub);
        return { subdomain: sub, ips, source: 'certificate' } as SubdomainInfo;
      } catch {
        return { subdomain: sub, ips: [], source: 'certificate (inactive)' } as SubdomainInfo;
      }
    });
    const resolved = await runTasksWithRetry(tasks, { concurrency: CONFIG.CONCURRENCY.DEFAULT, retries: 1 });
    return resolved.filter(r => !(r instanceof Error)) as SubdomainInfo[];
  } catch (error) {
    console.error('crt.sh error:', error);
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const { domain } = await request.json();

    if (!domain || typeof domain !== 'string') {
      return NextResponse.json(
        { error: 'Домен не указан' },
        { status: 400 }
      );
    }

    const cleanDomain = domain
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '')
      .trim()
      .toLowerCase();

    if (!cleanDomain || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(cleanDomain)) {
      return NextResponse.json(
        { error: 'Неверный формат домена' },
        { status: 400 }
      );
    }

    const allSubdomains: SubdomainInfo[] = [];

    // 1. Проверка основного домена
    const mainDomain = await checkSubdomain(cleanDomain);
    if (mainDomain) {
      allSubdomains.push(mainDomain);
    }

    // 2. Проверка популярных поддоменов (через worker с concurrency)
    const commonTasks = COMMON_SUBDOMAINS.map(sub => () => checkSubdomain(`${sub}.${cleanDomain}`));
    const commonResults = await runTasksWithRetry(commonTasks, { concurrency: CONFIG.CONCURRENCY.DEFAULT, retries: 1 });
    for (const r of commonResults) {
      if (r && !(r instanceof Error)) allSubdomains.push(r);
    }

    // 3. Параллельный поиск через бесплатные источники
    const [certSubdomains, hackerTargetNames, urlScanNames, alienVaultNames] = await Promise.all([
      getSubdomainsFromCrtSh(cleanDomain),
      getFromHackertarget(cleanDomain).catch(() => [] as string[]),
      getFromURLScan(cleanDomain).catch(() => [] as string[]),
      getFromAlienVault(cleanDomain).catch(() => [] as string[]),
    ]);

    // Преобразуем строки из passive sources в SubdomainInfo
    const passiveResults: SubdomainInfo[] = [
      ...hackerTargetNames.map(s => ({ subdomain: s, ips: [], source: 'hackertarget' })),
      ...urlScanNames.map(s => ({ subdomain: s, ips: [], source: 'urlscan.io' })),
      ...alienVaultNames.map(s => ({ subdomain: s, ips: [], source: 'alienvault' })),
    ];

    // Объединяем результаты, избегая дубликатов
    const subdomainMap = new Map<string, SubdomainInfo>();
    for (const sub of [...allSubdomains, ...certSubdomains, ...passiveResults]) {
      const key = sub.subdomain.toLowerCase();
      const existing = subdomainMap.get(key);
      if (!existing) {
        subdomainMap.set(key, { ...sub, subdomain: key });
      } else if (sub.ips.length > 0 && existing.ips.length === 0) {
        subdomainMap.set(key, { ...sub, subdomain: key });
      } else if (sub.ips.length > 0) {
        const mergedIps = Array.from(new Set([...existing.ips, ...sub.ips]));
        subdomainMap.set(key, { ...existing, ips: mergedIps });
      }
    }

    // 4. Резолвим IP для всех поддоменов, у которых ips пустой
    const unresolvedEntries = Array.from(subdomainMap.entries()).filter(([, v]) => v.ips.length === 0);
    if (unresolvedEntries.length > 0) {
      const resolveTasks = unresolvedEntries.map(([key, info]) => async () => {
        try {
          const ips = await dns.resolve4(info.subdomain);
          return { key, ips };
        } catch {
          // Пробуем AAAA (IPv6) если A-запись не нашлась
          try {
            const ips6 = await dns.resolve6(info.subdomain);
            return { key, ips: ips6 };
          } catch {
            return { key, ips: [] as string[] };
          }
        }
      });
      const resolved = await runTasksWithRetry(resolveTasks, { concurrency: CONFIG.CONCURRENCY.DEFAULT, retries: 1 });
      for (const r of resolved) {
        if (r && !(r instanceof Error) && r.ips.length > 0) {
          const entry = subdomainMap.get(r.key);
          if (entry) {
            subdomainMap.set(r.key, { ...entry, ips: r.ips });
          }
        }
      }
    }

    const result: DomainCheckResult = {
      domain: cleanDomain,
      subdomains: Array.from(subdomainMap.values()).sort((a, b) => 
        a.subdomain.localeCompare(b.subdomain)
      ),
      total: subdomainMap.size
    };

    // Cache aggregated result
    try {
      const cache = createDefaultCache<DomainCheckResult>();
      const key = `check:${cleanDomain}`;
      await cache.set(key, result, CONFIG.TTL.AGGREGATED_MS);
    } catch (e) {
      console.warn('cache set failed', e);
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error('Domain check error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Ошибка при проверке домена',
      },
      { status: 500 }
    );
  }
}
