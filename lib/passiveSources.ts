/**
 * passiveSources.ts
 *
 * Small stubs for passive data source integrations (crt.sh already in reverse.ts).
 * Implementations here should be small wrappers that fetch and normalize results.
 */
import logger from "./logger";

export async function getFromSecurityTrails(domainOrIp: string): Promise<string[]> {
  // Placeholder: SecurityTrails requires API key; implement when key available.
  logger.debug({ domainOrIp }, "getFromSecurityTrails: stub called");
  return [];
}

export async function getFromCommonCrawl(domain: string): Promise<string[]> {
  // Placeholder for CommonCrawl extraction; implement as needed.
  logger.debug({ domain }, "getFromCommonCrawl: stub called");
  return [];
}

export default { getFromSecurityTrails, getFromCommonCrawl };
