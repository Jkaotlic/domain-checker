import { NextRequest, NextResponse } from 'next/server';
import { createDefaultCache } from '../../../lib/cache';
import { CONFIG } from '../../../lib/config';
import runTasksWithRetry from '../../../lib/net/worker';
import {
  getFromHackertarget, getFromURLScan, getFromAlienVault,
  getFromCrtSh, getFromWebArchive, getFromCertSpotter,
  getFromThreatMiner, getFromAnubis, getFromRapidDNS, getFromBufferOver,
} from '../../../lib/passiveSources';
import { resolve4WithFallback, resolve6WithFallback, attemptZoneTransfer } from '../../../lib/dns';
import { detectWildcard } from '../../../lib/reverse';

interface SubdomainInfo {
  subdomain: string;
  ips: string[];
  source: string;
}

interface DomainCheckResult {
  domain: string;
  subdomains: SubdomainInfo[];
  total: number;
  wildcardDetected?: boolean;
  sources: string[];
  error?: string;
}

// Максимально расширенный список популярных поддоменов (~500)
const COMMON_SUBDOMAINS = [
  // Web
  'www', 'www1', 'www2', 'www3', 'www4', 'web', 'web1', 'web2', 'site', 'home',
  // Mail
  'mail', 'mail1', 'mail2', 'mail3', 'webmail', 'webmail2', 'email', 'e', 'smtp',
  'smtp1', 'smtp2', 'smtp3', 'pop', 'pop3', 'imap', 'imap2', 'exchange', 'owa',
  'mx', 'mx1', 'mx2', 'mx3', 'mailer', 'postfix', 'mailgw', 'mailgateway',
  'autodiscover', 'autoconfig', 'mta', 'relay', 'relay1', 'relay2',
  // DNS & NS
  'ns', 'ns1', 'ns2', 'ns3', 'ns4', 'ns5', 'dns', 'dns1', 'dns2', 'dns3',
  // FTP & Files
  'ftp', 'ftp1', 'ftp2', 'sftp', 'files', 'file', 'download', 'downloads',
  'upload', 'uploads', 'share', 'shared', 'nas', 'nfs',
  // Admin & Control
  'admin', 'admin1', 'admin2', 'administrator', 'root', 'cpanel', 'whm',
  'panel', 'control', 'manager', 'manage', 'management', 'webadmin', 'sysadmin',
  'backend', 'backoffice', 'cms',
  // API & Services
  'api', 'api1', 'api2', 'api3', 'api-v2', 'api-v3', 'rest', 'graphql', 'grpc',
  'gateway', 'gw', 'service', 'services', 'svc', 'microservice', 'rpc',
  'ws', 'websocket', 'wss', 'socket', 'webhook', 'webhooks', 'callback',
  // Mobile & Apps
  'app', 'app1', 'app2', 'mobile', 'm', 'android', 'ios', 'apps', 'play',
  'pwa', 'hybrid',
  // CDN & Static
  'cdn', 'cdn1', 'cdn2', 'cdn3', 'cdn4', 'static', 'static1', 'static2',
  'assets', 'asset', 'media', 'media1', 'media2', 'images', 'image', 'img',
  'img1', 'img2', 'img3', 'photos', 'photo', 'pic', 'pics', 'thumb', 'thumbs',
  'video', 'videos', 'stream', 'streaming', 'live', 'vod',
  'css', 'js', 'fonts', 'font', 'res', 'resources', 'content',
  // E-commerce
  'shop', 'store', 'cart', 'checkout', 'payment', 'pay', 'payments',
  'orders', 'order', 'products', 'catalog', 'market', 'marketplace', 'billing',
  'invoice', 'invoices', 'subscriptions',
  // Content & Community
  'blog', 'blogs', 'news', 'press', 'forum', 'forums', 'community',
  'wiki', 'kb', 'knowledgebase', 'help', 'support', 'helpdesk', 'ticket',
  'tickets', 'feedback', 'ideas', 'suggest',
  'docs', 'doc', 'documentation', 'faq', 'learn', 'tutorial', 'tutorials',
  'guides', 'guide', 'handbook', 'manual', 'reference',
  // Dev & Staging
  'dev', 'dev1', 'dev2', 'dev3', 'development', 'develop',
  'staging', 'stage', 'stg', 'test', 'test1', 'test2', 'test3', 'testing',
  'qa', 'qa1', 'qa2', 'demo', 'demo1', 'demo2', 'sandbox',
  'beta', 'alpha', 'preview', 'uat', 'preprod', 'pre', 'canary',
  'nightly', 'rc', 'release', 'hotfix', 'feature',
  // CI/CD & DevOps
  'ci', 'cd', 'jenkins', 'gitlab', 'github', 'bitbucket',
  'sonar', 'sonarqube', 'nexus', 'artifactory', 'registry', 'repo',
  'docker', 'k8s', 'kubernetes', 'rancher', 'portainer', 'harbor',
  'terraform', 'ansible', 'puppet', 'chef', 'salt',
  'argo', 'argocd', 'drone', 'tekton', 'buildkite', 'circleci', 'travis',
  // Monitoring & Analytics
  'analytics', 'stats', 'statistics', 'metrics', 'monitor', 'monitoring',
  'status', 'health', 'healthcheck', 'uptime',
  'logs', 'log', 'logging', 'grafana', 'kibana', 'prometheus', 'zabbix',
  'nagios', 'datadog', 'newrelic', 'sentry', 'apm', 'elk', 'splunk',
  'jaeger', 'zipkin', 'trace', 'tracing',
  // Security & Auth
  'vpn', 'vpn1', 'vpn2', 'remote', 'secure', 'ssl', 'tls',
  'auth', 'auth2', 'login', 'signin', 'signon', 'oauth', 'oauth2', 'sso',
  'cas', 'ldap', 'ad', 'identity', 'id', 'iam', 'keycloak', 'okta',
  'mfa', '2fa', 'otp', 'token', 'tokens', 'cert', 'certs', 'pki',
  'waf', 'firewall', 'ids', 'ips', 'siem',
  // Cloud & Infrastructure
  'cloud', 'aws', 'azure', 'gcp', 'gce', 's3', 'storage', 'blob',
  'compute', 'lambda', 'function', 'functions', 'serverless',
  'edge', 'origin', 'proxy', 'proxy1', 'proxy2', 'reverse', 'lb', 'load',
  'balancer', 'haproxy', 'nginx', 'apache', 'traefik', 'envoy', 'ingress',
  'cache', 'cache1', 'cache2', 'varnish', 'memcached',
  // Databases
  'db', 'db1', 'db2', 'db3', 'database', 'mysql', 'mysql1',
  'postgres', 'postgresql', 'pg', 'pgsql', 'mongo', 'mongodb',
  'redis', 'redis1', 'elastic', 'elasticsearch', 'es', 'solr',
  'kafka', 'rabbitmq', 'rabbit', 'mq', 'amqp', 'nats', 'activemq',
  'cassandra', 'couchdb', 'influx', 'influxdb', 'clickhouse', 'mariadb',
  // Servers
  'server', 'server1', 'server2', 'server3', 'server4', 'server5',
  'srv', 'srv1', 'srv2', 'srv3', 'host', 'host1', 'host2',
  'node', 'node1', 'node2', 'node3', 'node4', 'node5',
  'vps', 'vps1', 'vps2', 'vm', 'vm1', 'vm2',
  'backup', 'backup1', 'backup2', 'bak', 'bk', 'mirror', 'replica',
  // Communication
  'social', 'chat', 'im', 'msg', 'message', 'messages', 'messaging',
  'meet', 'meeting', 'conference', 'conf', 'call', 'calls', 'webrtc',
  'slack', 'teams', 'zoom', 'matrix', 'xmpp', 'irc',
  'voip', 'sip', 'pbx', 'asterisk', 'phone', 'tel', 'fax',
  // Marketing
  'marketing', 'promo', 'campaign', 'campaigns', 'newsletter', 'subscribe',
  'landing', 'lp', 'click', 'track', 'tracking', 'pixel',
  'go', 'link', 'links', 'redirect', 'short', 'url', 'r',
  'affiliate', 'affiliates', 'partner', 'partners', 'referral',
  // User-facing
  'dashboard', 'dash', 'console', 'portal', 'account', 'accounts',
  'my', 'user', 'users', 'profile', 'member', 'members',
  'client', 'clients', 'customer', 'customers', 'crm',
  'search', 'find', 'explore', 'discover',
  // Legacy & Versions
  'old', 'new', 'legacy', 'archive', 'archives', 'v1', 'v2', 'v3', 'v4',
  'classic', 'modern', 'next', 'current',
  // Corporate
  'ads', 'ad', 'advertising', 'adserver',
  'careers', 'career', 'jobs', 'hr', 'recruit', 'recruiting',
  'about', 'info', 'information', 'contact', 'contacts',
  'legal', 'privacy', 'terms', 'tos', 'policy', 'compliance',
  'investor', 'investors', 'ir',
  // Regional / i18n
  'en', 'ru', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'ja', 'ko', 'zh', 'ar',
  'eu', 'us', 'uk', 'au', 'ca', 'in', 'br', 'cn', 'jp', 'asia', 'global',
  // Internal/Corporate tools
  'intranet', 'internal', 'corp', 'corporate', 'office',
  'erp', 'sap', 'oracle', 'salesforce', 'sf',
  'jira', 'confluence', 'bamboo', 'crowd', 'fisheye',
  'redmine', 'trac', 'bugzilla', 'mantis',
  'sharepoint', 'onedrive', 'outlook', 'o365',
  'vpn-gw', 'radius', 'tacacs', 'ntp', 'ntp1', 'ntp2', 'time',
  'snmp', 'netflow', 'syslog',
  // Misc
  'data', 'data1', 'data2', 'feed', 'feeds', 'rss', 'atom',
  'xml', 'json', 'soap', 'wsdl', 'graphql',
  'print', 'printer', 'scan', 'scanner',
  'git', 'svn', 'hg', 'cvs', 'code', 'source',
  'wiki2', 'extranet', 'guest', 'temp', 'tmp', 'scratch',
  'lab', 'labs', 'research', 'r-d', 'poc',
  'map', 'maps', 'geo', 'gis', 'location', 'locations',
  'event', 'events', 'calendar', 'cal', 'booking', 'reservation',
  'survey', 'surveys', 'poll', 'polls', 'quiz', 'form', 'forms',
  'report', 'reports', 'bi', 'tableau', 'powerbi', 'looker',
  'notification', 'notifications', 'push', 'alert', 'alerts',
  'smtp-out', 'smtp-in', 'mail-gw', 'mailrelay',
  'img-cdn', 'video-cdn', 'edge1', 'edge2', 'pop1', 'pop2',
];

async function checkSubdomain(subdomain: string): Promise<SubdomainInfo | null> {
  try {
    const ips = await resolve4WithFallback(subdomain);
    if (ips.length > 0) {
      return { subdomain, ips, source: 'dns-bruteforce' };
    }
    // Try IPv6
    const ips6 = await resolve6WithFallback(subdomain);
    if (ips6.length > 0) {
      return { subdomain, ips: ips6, source: 'dns-bruteforce' };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Filter subdomains to ensure they belong to the target domain.
 */
function filterForDomain(names: string[], domain: string): string[] {
  return names.filter(name => {
    const clean = name.toLowerCase().trim();
    return clean === domain || clean.endsWith(`.${domain}`);
  });
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
    const usedSources: Set<string> = new Set();

    // 1. Проверка основного домена + обнаружение wildcard (параллельно)
    const [mainDomain, isWildcard, zoneTransferResults] = await Promise.all([
      checkSubdomain(cleanDomain),
      detectWildcard(cleanDomain),
      attemptZoneTransfer(cleanDomain).catch(() => [] as string[]),
    ]);

    if (mainDomain) {
      allSubdomains.push(mainDomain);
    }

    // Zone transfer results
    if (zoneTransferResults.length > 0) {
      usedSources.add('zone-transfer');
      for (const sub of filterForDomain(zoneTransferResults, cleanDomain)) {
        allSubdomains.push({ subdomain: sub, ips: [], source: 'zone-transfer' });
      }
    }

    // 2. Проверка популярных поддоменов (через worker с concurrency)
    usedSources.add('dns-bruteforce');
    const commonTasks = COMMON_SUBDOMAINS.map(sub => () => checkSubdomain(`${sub}.${cleanDomain}`));
    const commonResults = await runTasksWithRetry(commonTasks, {
      concurrency: CONFIG.CONCURRENCY.DEFAULT,
      retries: 1,
    });
    for (const r of commonResults) {
      if (r && !(r instanceof Error)) allSubdomains.push(r);
    }

    // 3. Параллельный поиск через все 10 бесплатных источников
    const sourceEntries: Array<{ name: string; fn: () => Promise<string[]> }> = [
      { name: 'crt.sh', fn: () => getFromCrtSh(cleanDomain) },
      { name: 'hackertarget', fn: () => getFromHackertarget(cleanDomain) },
      { name: 'urlscan.io', fn: () => getFromURLScan(cleanDomain) },
      { name: 'alienvault', fn: () => getFromAlienVault(cleanDomain) },
      { name: 'webarchive', fn: () => getFromWebArchive(cleanDomain) },
      { name: 'certspotter', fn: () => getFromCertSpotter(cleanDomain) },
      { name: 'threatminer', fn: () => getFromThreatMiner(cleanDomain) },
      { name: 'anubis', fn: () => getFromAnubis(cleanDomain) },
      { name: 'rapiddns', fn: () => getFromRapidDNS(cleanDomain) },
      { name: 'bufferover', fn: () => getFromBufferOver(cleanDomain) },
    ];

    const passivePromises = sourceEntries.map(async (entry) => {
      try {
        const names = await entry.fn();
        const filtered = filterForDomain(names, cleanDomain);
        if (filtered.length > 0) usedSources.add(entry.name);
        return { source: entry.name, subdomains: filtered };
      } catch {
        return { source: entry.name, subdomains: [] as string[] };
      }
    });

    const passiveResults = await Promise.all(passivePromises);

    // Преобразуем строки из passive sources в SubdomainInfo
    for (const result of passiveResults) {
      for (const sub of result.subdomains) {
        allSubdomains.push({ subdomain: sub.toLowerCase(), ips: [], source: result.source });
      }
    }

    // Объединяем результаты, избегая дубликатов
    const subdomainMap = new Map<string, SubdomainInfo>();
    for (const sub of allSubdomains) {
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

    // 4. Определяем wildcard IP для фильтрации
    let wildcardIps = new Set<string>();
    if (isWildcard) {
      const rndHost = `xz-${Math.random().toString(36).slice(2, 8)}.${cleanDomain}`;
      const wIps = await resolve4WithFallback(rndHost).catch(() => [] as string[]);
      wildcardIps = new Set(wIps);
    }

    // 5. Резолвим IP для всех поддоменов, у которых ips пустой (с fallback resolvers)
    const unresolvedEntries = Array.from(subdomainMap.entries()).filter(([, v]) => v.ips.length === 0);
    if (unresolvedEntries.length > 0) {
      const resolveTasks = unresolvedEntries.map(([key, info]) => async () => {
        try {
          const ips = await resolve4WithFallback(info.subdomain);
          if (ips.length > 0) return { key, ips };
          // Пробуем AAAA (IPv6) если A-запись не нашлась
          const ips6 = await resolve6WithFallback(info.subdomain);
          return { key, ips: ips6 };
        } catch {
          return { key, ips: [] as string[] };
        }
      });
      const resolved = await runTasksWithRetry(resolveTasks, {
        concurrency: CONFIG.CONCURRENCY.DEFAULT,
        retries: 1,
      });
      for (const r of resolved) {
        if (r && !(r instanceof Error) && r.ips.length > 0) {
          const entry = subdomainMap.get(r.key);
          if (entry) {
            subdomainMap.set(r.key, { ...entry, ips: r.ips });
          }
        }
      }
    }

    // 6. Фильтрация wildcard записей (если обнаружен wildcard DNS)
    if (isWildcard && wildcardIps.size > 0) {
      for (const [key, entry] of subdomainMap) {
        if (entry.ips.length > 0 && entry.ips.every(ip => wildcardIps.has(ip))) {
          // Все IP совпадают с wildcard — вероятно, не настоящий поддомен
          // Оставляем только если найден из нескольких источников или это common subdomain
          if (entry.source === 'dns-bruteforce') {
            subdomainMap.delete(key);
          }
        }
      }
    }

    const result: DomainCheckResult = {
      domain: cleanDomain,
      subdomains: Array.from(subdomainMap.values()).sort((a, b) =>
        a.subdomain.localeCompare(b.subdomain)
      ),
      total: subdomainMap.size,
      wildcardDetected: isWildcard,
      sources: Array.from(usedSources).sort(),
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
