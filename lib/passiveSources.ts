/**
 * passiveSources.ts
 *
 * Free passive data source integrations — 10 sources, all without API keys.
 */
import fetchURLScan from './sources/urlscan';
import fetchHackerTarget from './sources/hackertarget';
import fetchAlienVault from './sources/alienvault';
import fetchCrtSh from './sources/crtsh';
import fetchWebArchive from './sources/webarchive';
import fetchCertSpotter from './sources/certspotter';
import fetchThreatMiner from './sources/threatminer';
import fetchAnubis from './sources/anubis';
import fetchRapidDNS from './sources/rapiddns';
import fetchBufferOver from './sources/bufferover';

export {
  fetchURLScan, fetchHackerTarget, fetchAlienVault,
  fetchCrtSh, fetchWebArchive, fetchCertSpotter,
  fetchThreatMiner, fetchAnubis, fetchRapidDNS, fetchBufferOver,
};

export async function getFromURLScan(domain: string) { return fetchURLScan(domain); }
export async function getFromHackertarget(domain: string) { return fetchHackerTarget(domain); }
export async function getFromAlienVault(domain: string) { return fetchAlienVault(domain); }
export async function getFromCrtSh(domain: string) { return fetchCrtSh(domain); }
export async function getFromWebArchive(domain: string) { return fetchWebArchive(domain); }
export async function getFromCertSpotter(domain: string) { return fetchCertSpotter(domain); }
export async function getFromThreatMiner(domain: string) { return fetchThreatMiner(domain); }
export async function getFromAnubis(domain: string) { return fetchAnubis(domain); }
export async function getFromRapidDNS(domain: string) { return fetchRapidDNS(domain); }
export async function getFromBufferOver(domain: string) { return fetchBufferOver(domain); }

const passiveSources = {
  getFromURLScan, getFromHackertarget, getFromAlienVault,
  getFromCrtSh, getFromWebArchive, getFromCertSpotter,
  getFromThreatMiner, getFromAnubis, getFromRapidDNS, getFromBufferOver,
};
export default passiveSources;
