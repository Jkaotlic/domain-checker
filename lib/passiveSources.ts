/**
 * passiveSources.ts
 *
 * Free passive data source integrations (crt.sh already in reverse.ts).
 * Only free APIs without API keys are used.
 */
import fetchURLScan from './sources/urlscan';
import fetchHackerTarget from './sources/hackertarget';
import fetchAlienVault from './sources/alienvault';

export { fetchURLScan, fetchHackerTarget, fetchAlienVault };
export async function getFromURLScan(domain: string) { return fetchURLScan(domain); }
export async function getFromHackertarget(domain: string) { return fetchHackerTarget(domain); }
export async function getFromAlienVault(domain: string) { return fetchAlienVault(domain); }

const passiveSources = { getFromURLScan, getFromHackertarget, getFromAlienVault };
export default passiveSources;
