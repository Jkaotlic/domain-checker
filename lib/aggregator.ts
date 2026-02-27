import { SubdomainEntry, SourceRecord } from "./types";
import { createDefaultCache } from "./cache";
import { normalizeDomain } from "./subdomain";

const cache = createDefaultCache<SubdomainEntry>();

// Per-key mutex to serialize concurrent upserts for the same host
const inFlightMap = new Map<string, Promise<SubdomainEntry>>();

/**
 * Merge two SubdomainEntry objects.
 * - ips: union
 * - tags: union
 * - sources: dedupe by `source`, keep SourceRecord with latest seenAt
 * - firstSeen: min(timestamp)
 * - lastSeen: max(timestamp)
 * - other fields: incoming overrides existing
 */
export function mergeSubdomainEntries(
  existing: SubdomainEntry | null,
  incoming: SubdomainEntry
): SubdomainEntry {
  const now = new Date().toISOString();
  if (!existing) {
    const normalized: SubdomainEntry = {
      ...incoming,
      firstSeen: incoming.firstSeen ?? incoming.lastSeen ?? now,
      lastSeen: incoming.lastSeen ?? incoming.firstSeen ?? now,
      ips: Array.from(new Set(incoming.ips || [])),
      tags: Array.from(new Set(incoming.tags || [])),
      sources: (incoming.sources || []).map((s) => ({ ...s })),
    };
    return normalized;
  }

  // Merge arrays
  const ips = Array.from(new Set([...(existing.ips || []), ...(incoming.ips || [])]));
  const tags = Array.from(new Set([...(existing.tags || []), ...(incoming.tags || [])]));

  // Merge sources: keep entry per source with latest seenAt
  const srcMap = new Map<string, SourceRecord>();
  (existing.sources || []).forEach((s) => {
    srcMap.set(s.source, { ...s });
  });
  (incoming.sources || []).forEach((s) => {
    const prev = srcMap.get(s.source);
    if (!prev) {
      srcMap.set(s.source, { ...s });
    } else {
      // compare seenAt
      const prevTime = new Date(prev.seenAt).getTime();
      const newTime = new Date(s.seenAt).getTime();
      if (newTime >= prevTime) {
        srcMap.set(s.source, { ...s });
      } else {
        // keep prev
      }
    }
  });
  const sources = Array.from(srcMap.values());

  // firstSeen - earliest
  const times = [
    ...(existing.firstSeen ? [new Date(existing.firstSeen).getTime()] : []),
    ...(incoming.firstSeen ? [new Date(incoming.firstSeen).getTime()] : []),
  ].filter((t) => Number.isFinite(t));
  const firstSeen = times.length ? new Date(Math.min(...times)).toISOString() : existing.firstSeen ?? incoming.firstSeen;

  // lastSeen - latest
  const times2 = [
    ...(existing.lastSeen ? [new Date(existing.lastSeen).getTime()] : []),
    ...(incoming.lastSeen ? [new Date(incoming.lastSeen).getTime()] : []),
  ].filter((t) => Number.isFinite(t));
  const lastSeen = times2.length ? new Date(Math.max(...times2)).toISOString() : existing.lastSeen ?? incoming.lastSeen;

  // Merge other fields: prefer incoming for unknown keys (shallow)
  const merged: SubdomainEntry = {
    ...existing,
    ...incoming,
    ips,
    tags,
    sources,
    firstSeen,
    lastSeen,
  };

  return merged;
}

/**
 * Upsert an entry into cache with per-key promise dedupe.
 * Keying by normalized host.
 */
export async function upsertSubdomain(entry: SubdomainEntry): Promise<SubdomainEntry> {
  const key = normalizeDomain(entry.host);

  // Wait for any in-flight operation on the same key, then run ours
  const prev = inFlightMap.get(key) ?? Promise.resolve(null as SubdomainEntry | null);

  const op = prev.catch(() => null).then(async () => {
    try {
      const existing = (await cache.get(key)) ?? null;
      const merged = mergeSubdomainEntries(existing as SubdomainEntry | null, {
        ...entry,
        host: key,
      });
      await cache.set(key, merged);
      return merged;
    } finally {
      // Only clear if we are still the latest operation
      if (inFlightMap.get(key) === op) inFlightMap.delete(key);
    }
  });

  inFlightMap.set(key, op);
  return op;
}

/**
 * Expose helper to read current cached entry (for tests / consumers).
 */
export async function getCachedSubdomain(host: string): Promise<SubdomainEntry | undefined> {
  const key = normalizeDomain(host);
  return cache.get(key) as Promise<SubdomainEntry | undefined>;
}
