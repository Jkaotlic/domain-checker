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
