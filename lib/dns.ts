import type { AnyRecord } from 'dns';
import { promises as dnsPromises, Resolver } from 'dns';
import { withTimeout } from './net/timeout';
import logger from './logger';
import { CONFIG } from './config';

const PUBLIC_RESOLVERS = [
  ['8.8.8.8', '8.8.4.4'],       // Google
  ['1.1.1.1', '1.0.0.1'],       // Cloudflare
  ['9.9.9.9', '149.112.112.112'], // Quad9
];

/**
 * Resolve A records with fallback to public DNS resolvers.
 * Tries system resolver first, then Google, Cloudflare, Quad9.
 */
export async function resolve4WithFallback(host: string, timeoutMs?: number): Promise<string[]> {
  const timeout = timeoutMs ?? CONFIG.DNS_TIMEOUT_MS;

  // Try system resolver first
  try {
    const result = await withTimeout(dnsPromises.resolve4(host), timeout);
    if (result.length > 0) return result;
  } catch {
    // fall through to public resolvers
  }

  // Try public resolvers
  for (const servers of PUBLIC_RESOLVERS) {
    try {
      const resolver = new Resolver();
      resolver.setServers(servers);
      const result = await withTimeout(
        new Promise<string[]>((resolve, reject) => {
          resolver.resolve4(host, (err, addresses) => {
            if (err) reject(err);
            else resolve(addresses);
          });
        }),
        timeout,
      );
      if (result.length > 0) return result;
    } catch {
      continue;
    }
  }

  return [];
}

/**
 * Resolve AAAA (IPv6) records with fallback to public DNS resolvers.
 */
export async function resolve6WithFallback(host: string, timeoutMs?: number): Promise<string[]> {
  const timeout = timeoutMs ?? CONFIG.DNS_TIMEOUT_MS;

  try {
    const result = await withTimeout(dnsPromises.resolve6(host), timeout);
    if (result.length > 0) return result;
  } catch {
    // fall through
  }

  for (const servers of PUBLIC_RESOLVERS) {
    try {
      const resolver = new Resolver();
      resolver.setServers(servers);
      const result = await withTimeout(
        new Promise<string[]>((resolve, reject) => {
          resolver.resolve6(host, (err, addresses) => {
            if (err) reject(err);
            else resolve(addresses);
          });
        }),
        timeout,
      );
      if (result.length > 0) return result;
    } catch {
      continue;
    }
  }

  return [];
}

/**
 * Attempt DNS zone transfer (AXFR) — rarely succeeds on production domains
 * but when it does, reveals all records.
 */
export async function attemptZoneTransfer(domain: string): Promise<string[]> {
  try {
    // First get nameservers
    const nsRecords = await withTimeout(dnsPromises.resolveNs(domain), CONFIG.DNS_TIMEOUT_MS);
    if (!nsRecords.length) return [];

    const subs = new Set<string>();

    for (const ns of nsRecords.slice(0, 3)) {
      try {
        // Resolve the nameserver IP
        const nsIps = await withTimeout(dnsPromises.resolve4(ns), CONFIG.DNS_TIMEOUT_MS);
        if (!nsIps.length) continue;

        const resolver = new Resolver();
        resolver.setServers([nsIps[0]]);

        // Try ANY record type to get as much as possible
        const result = await withTimeout(
          new Promise<AnyRecord[]>((resolve, reject) => {
            resolver.resolveAny(domain, (err, records) => {
              if (err) reject(err);
              else resolve(records);
            });
          }),
          CONFIG.DNS_TIMEOUT_MS,
        );

        for (const record of result) {
          if ('value' in record && typeof record.value === 'string') {
            const clean = record.value.toLowerCase().replace(/\.$/, '');
            if (clean.endsWith(`.${domain}`) || clean === domain) {
              subs.add(clean);
            }
          }
        }
      } catch {
        continue;
      }
    }

    return Array.from(subs);
  } catch (err) {
    logger.debug({ err, domain }, 'zone transfer attempt failed (expected)');
    return [];
  }
}

