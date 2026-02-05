import { NextRequest, NextResponse } from 'next/server';
import { promises as dns } from 'dns';

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
  // Основные
  'www', 'mail', 'ftp', 'smtp', 'pop', 'pop3', 'imap', 'webmail', 'email',
  // DNS и инфраструктура
  'ns', 'ns1', 'ns2', 'ns3', 'ns4', 'dns', 'dns1', 'dns2',
  // Административные
  'admin', 'administrator', 'root', 'cpanel', 'whm', 'panel', 'control',
  // Веб-сервисы
  'api', 'api1', 'api2', 'rest', 'graphql', 'gateway', 'service', 'services',
  // Мобильные и приложения
  'app', 'mobile', 'm', 'android', 'ios', 'apps', 'play',
  // CDN и статика
  'cdn', 'cdn1', 'cdn2', 'cdn3', 'static', 'assets', 'media', 'images', 'img',
  'video', 'videos', 'photos', 'files', 'download', 'downloads', 'content',
  'css', 'js', 'fonts', 'uploads',
  // E-commerce
  'shop', 'store', 'cart', 'checkout', 'payment', 'pay', 'orders', 'products',
  // Сообщество и контент
  'blog', 'news', 'forum', 'community', 'wiki', 'kb', 'help', 'support',
  'docs', 'documentation', 'faq', 'learn', 'tutorial', 'guides',
  // Разработка и тестирование
  'dev', 'development', 'staging', 'stage', 'test', 'testing', 'qa',
  'demo', 'sandbox', 'beta', 'alpha', 'preview', 'uat', 'preprod',
  // Аналитика и мониторинг
  'analytics', 'stats', 'statistics', 'metrics', 'monitor', 'monitoring',
  'status', 'health', 'logs', 'log', 'grafana', 'kibana',
  // Безопасность и VPN
  'vpn', 'remote', 'secure', 'ssl', 'auth', 'login', 'oauth', 'sso',
  // Облачные сервисы
  'cloud', 'aws', 'azure', 'gcp', 's3', 'storage',
  // Почтовые
  'autodiscover', 'autoconfig', 'mx', 'mx1', 'mx2', 'smtp1', 'smtp2',
  // Социальные и коммуникация
  'social', 'chat', 'meet', 'conference', 'video', 'call', 'webrtc',
  // Маркетинг
  'marketing', 'promo', 'campaign', 'newsletter', 'subscribe',
  // Дополнительные сервисы
  'dashboard', 'console', 'portal', 'account', 'my', 'user', 'profile',
  'search', 'www2', 'www3', 'old', 'new', 'v2', 'v3', 'web', 'site',
  'server', 'host', 'node', 'edge', 'origin', 'backup', 'mirror',
  // Специфичные для больших платформ
  'ads', 'advertising', 'affiliates', 'partners', 'developer', 'developers',
  'careers', 'jobs', 'about', 'contact', 'legal', 'privacy', 'terms'
];

async function checkSubdomain(subdomain: string): Promise<SubdomainInfo | null> {
  try {
    const ips = await dns.resolve4(subdomain);
    return {
      subdomain,
      ips,
      source: 'dns-check'
    };
  } catch {
    return null;
  }
}

async function getSubdomainsFromCrtSh(domain: string): Promise<SubdomainInfo[]> {
  try {
    const response = await fetch(`https://crt.sh/?q=%.${domain}&output=json`, {
      headers: { 'User-Agent': 'Domain-Checker/1.0' },
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    const subdomains = new Set<string>();
    
    for (const cert of data) {
      const names = cert.name_value.split('\n');
      for (const name of names) {
        const cleanName = name.trim().toLowerCase();
        if (cleanName.endsWith(`.${domain}`) && !cleanName.includes('*')) {
          subdomains.add(cleanName);
        }
      }
    }
    
    const results: SubdomainInfo[] = [];
    for (const subdomain of Array.from(subdomains).slice(0, 100)) {
      try {
        const ips = await dns.resolve4(subdomain);
        results.push({
          subdomain,
          ips,
          source: 'certificate'
        });
      } catch {
        // Поддомен найден в сертификате, но не резолвится
        results.push({
          subdomain,
          ips: [],
          source: 'certificate (inactive)'
        });
      }
    }
    
    return results;
  } catch (error) {
    console.error('crt.sh error:', error);
    return [];
  }
}

// Поиск через HackerTarget API
async function getSubdomainsFromHackerTarget(domain: string): Promise<SubdomainInfo[]> {
  try {
    const response = await fetch(`https://api.hackertarget.com/hostsearch/?q=${domain}`, {
      headers: { 'User-Agent': 'Domain-Checker/1.0' },
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) return [];
    
    const text = await response.text();
    if (text.includes('error') || text.includes('API count exceeded')) return [];
    
    const lines = text.split('\n').filter(line => line.trim());
    const results: SubdomainInfo[] = [];
    
    for (const line of lines.slice(0, 50)) {
      const [subdomain, ip] = line.split(',').map(s => s.trim());
      if (subdomain && ip) {
        results.push({
          subdomain: subdomain.toLowerCase(),
          ips: [ip],
          source: 'hackertarget'
        });
      }
    }
    
    return results;
  } catch (error) {
    console.error('HackerTarget error:', error);
    return [];
  }
}

// Поиск через URLScan.io
async function getSubdomainsFromUrlScan(domain: string): Promise<SubdomainInfo[]> {
  try {
    const response = await fetch(`https://urlscan.io/api/v1/search/?q=domain:${domain}`, {
      headers: { 'User-Agent': 'Domain-Checker/1.0' },
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    const subdomains = new Set<string>();
    
    if (data.results) {
      for (const result of data.results) {
        if (result.page?.domain) {
          const subdomain = result.page.domain.toLowerCase();
          if (subdomain.endsWith(`.${domain}`) || subdomain === domain) {
            subdomains.add(subdomain);
          }
        }
        if (result.task?.domain) {
          const subdomain = result.task.domain.toLowerCase();
          if (subdomain.endsWith(`.${domain}`) || subdomain === domain) {
            subdomains.add(subdomain);
          }
        }
      }
    }
    
    const results: SubdomainInfo[] = [];
    for (const subdomain of Array.from(subdomains).slice(0, 50)) {
      try {
        const ips = await dns.resolve4(subdomain);
        results.push({
          subdomain,
          ips,
          source: 'urlscan.io'
        });
      } catch {
        results.push({
          subdomain,
          ips: [],
          source: 'urlscan.io (inactive)'
        });
      }
    }
    
    return results;
  } catch (error) {
    console.error('URLScan error:', error);
    return [];
  }
}

// Поиск через AlienVault OTX
async function getSubdomainsFromAlienVault(domain: string): Promise<SubdomainInfo[]> {
  try {
    const response = await fetch(`https://otx.alienvault.com/api/v1/indicators/domain/${domain}/passive_dns`, {
      headers: { 'User-Agent': 'Domain-Checker/1.0' },
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    const subdomains = new Set<string>();
    
    if (data.passive_dns) {
      for (const record of data.passive_dns) {
        if (record.hostname) {
          const subdomain = record.hostname.toLowerCase();
          if (subdomain.endsWith(`.${domain}`) || subdomain === domain) {
            subdomains.add(subdomain);
          }
        }
      }
    }
    
    const results: SubdomainInfo[] = [];
    for (const subdomain of Array.from(subdomains).slice(0, 50)) {
      try {
        const ips = await dns.resolve4(subdomain);
        results.push({
          subdomain,
          ips,
          source: 'alienvault'
        });
      } catch {
        results.push({
          subdomain,
          ips: [],
          source: 'alienvault (inactive)'
        });
      }
    }
    
    return results;
  } catch (error) {
    console.error('AlienVault error:', error);
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

    // Очистка домена от протоколов и слешей
    const cleanDomain = domain
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '')
      .trim();

    if (!cleanDomain) {
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

    // 2. Проверка популярных поддоменов (параллельно)
    const commonChecks = COMMON_SUBDOMAINS.map(sub => 
      checkSubdomain(`${sub}.${cleanDomain}`)
    );
    const commonResults = await Promise.all(commonChecks);
    allSubdomains.push(...commonResults.filter(r => r !== null) as SubdomainInfo[]);

    // 3. Параллельный поиск через все источники
    const [certSubdomains, hackerTargetSubdomains, urlScanSubdomains, alienVaultSubdomains] = await Promise.all([
      getSubdomainsFromCrtSh(cleanDomain),
      getSubdomainsFromHackerTarget(cleanDomain),
      getSubdomainsFromUrlScan(cleanDomain),
      getSubdomainsFromAlienVault(cleanDomain)
    ]);
    
    // Объединяем результаты, избегая дубликатов
    const subdomainMap = new Map<string, SubdomainInfo>();
    
    // Приоритет: активные домены с IP адресами важнее
    for (const sub of [
      ...allSubdomains, 
      ...certSubdomains, 
      ...hackerTargetSubdomains,
      ...urlScanSubdomains,
      ...alienVaultSubdomains
    ]) {
      const existing = subdomainMap.get(sub.subdomain);
      // Если домен уже есть, обновляем только если новый имеет IP, а старый нет
      if (!existing || (sub.ips.length > 0 && existing.ips.length === 0)) {
        subdomainMap.set(sub.subdomain, sub);
      }
    }

    const result: DomainCheckResult = {
      domain: cleanDomain,
      subdomains: Array.from(subdomainMap.values()).sort((a, b) => 
        a.subdomain.localeCompare(b.subdomain)
      ),
      total: subdomainMap.size
    };

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
