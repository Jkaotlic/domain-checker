import { normalizeDomain, isValidHost } from "../lib/subdomain";
import { mergeSubdomainEntries, upsertSubdomain, getCachedSubdomain } from "../lib/aggregator";
import { SubdomainEntry } from "../lib/types";

describe("normalizeDomain / isValidHost", () => {
  test("normalizes urls and punycode", () => {
    expect(normalizeDomain("https://пример.рф/path")).toBe("xn--e1afmkfd.xn--p1ai");
    expect(normalizeDomain("EXAMPLE.com:8080/foo")).toBe("example.com");
    expect(normalizeDomain("sub.example.co.uk")).toBe("sub.example.co.uk");
  });

  test("isValidHost detects valid hosts", () => {
    expect(isValidHost("example.com")).toBe(true);
    expect(isValidHost("xn--e1afmkfd.xn--p1ai")).toBe(true);
    expect(isValidHost("invalid..host")).toBe(false);
    expect(isValidHost("not a host")).toBe(false);
  });
});

describe("mergeSubdomainEntries", () => {
  test("merges ips, tags, sources and timestamps", async () => {
    const existing: SubdomainEntry = {
      host: "api.example.com",
      domain: "example.com",
      subdomain: "api",
      ips: ["1.1.1.1"],
      tags: ["prod"],
      sources: [{ source: "scannerA", seenAt: "2025-01-01T00:00:00.000Z" }],
      firstSeen: "2025-01-01T00:00:00.000Z",
      lastSeen: "2025-01-01T00:00:00.000Z",
    };

    const incoming: SubdomainEntry = {
      host: "api.example.com",
      domain: "example.com",
      subdomain: "api",
      ips: ["2.2.2.2", "1.1.1.1"],
      tags: ["canary"],
      sources: [
        { source: "scannerA", seenAt: "2025-02-01T00:00:00.000Z" },
        { source: "scannerB", seenAt: "2025-03-01T00:00:00.000Z" },
      ],
      firstSeen: "2025-02-01T00:00:00.000Z",
      lastSeen: "2025-03-01T00:00:00.000Z",
    };

    const merged = mergeSubdomainEntries(existing, incoming);

    // ips union
    expect(new Set(merged.ips)).toEqual(new Set(["1.1.1.1", "2.2.2.2"]));
    // tags union
    expect(new Set(merged.tags)).toEqual(new Set(["prod", "canary"]));
    // sources merged with latest seenAt for scannerA
    const srcMap = new Map(merged.sources.map((s) => [s.source, s.seenAt]));
    expect(srcMap.get("scannerA")).toBe("2025-02-01T00:00:00.000Z");
    expect(srcMap.get("scannerB")).toBe("2025-03-01T00:00:00.000Z");
    // firstSeen should be earliest
    expect(new Date(merged.firstSeen!).toISOString()).toBe("2025-01-01T00:00:00.000Z");
    // lastSeen should be latest
    expect(new Date(merged.lastSeen!).toISOString()).toBe("2025-03-01T00:00:00.000Z");
  });

  test("upsertSubdomain dedupes concurrent operations", async () => {
    const entry: SubdomainEntry = {
      host: "dup.example.com",
      domain: "example.com",
      subdomain: "dup",
      ips: ["3.3.3.3"],
      tags: ["t"],
      sources: [{ source: "x", seenAt: "2026-01-01T00:00:00.000Z" }],
      firstSeen: "2026-01-01T00:00:00.000Z",
      lastSeen: "2026-01-01T00:00:00.000Z",
    };

    // fire two concurrent upserts
    const [a, b] = await Promise.all([upsertSubdomain(entry), upsertSubdomain(entry)]);
    expect(a.host).toBe(b.host);
    const cached = await getCachedSubdomain("dup.example.com");
    expect(cached).toBeDefined();
    expect(cached!.ips).toContain("3.3.3.3");
  });
});
