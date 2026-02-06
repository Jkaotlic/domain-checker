/**
 * passiveSources.ts
 *
 * Small stubs for passive data source integrations (crt.sh already in reverse.ts).
 * Implementations here should be small wrappers that fetch and normalize results.
 */
import fetchSecurityTrails from './sources/securitytrails';
import fetchURLScan from './sources/urlscan';
import fetchHackerTarget from './sources/hackertarget';
import fetchAlienVault from './sources/alienvault';

export async function getFromSecurityTrails(domain: string) { return fetchSecurityTrails(domain); }
export async function getFromURLScan(domain: string) { return fetchURLScan(domain); }
export async function getFromHackertarget(domain: string) { return fetchHackerTarget(domain); }
export async function getFromAlienVault(domain: string) { return fetchAlienVault(domain); }

export async function getFromCommonCrawl(domain: string): Promise<string[]> {
  // Placeholder for CommonCrawl extraction; implement as needed.
  const { default: l } = await import('./logger');
  l.debug({ domain }, 'getFromCommonCrawl: stub called');
  return [];
}

export default { getFromSecurityTrails, getFromCommonCrawl, getFromURLScan, getFromHackertarget, getFromAlienVault };
