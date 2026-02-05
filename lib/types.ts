export interface SourceRecord {
  source: string;
  seenAt: string; // ISO timestamp
  metadata?: Record<string, unknown>;
}

export interface SubdomainEntry {
  host: string; // full host, e.g. "api.example.com"
  domain?: string | null; // eTLD+1 (if available)
  subdomain?: string | null; // host minus domain
  ips: string[]; // unique IPs
  tags: string[]; // unique tags
  sources: SourceRecord[]; // list of sources with seenAt
  firstSeen?: string; // ISO timestamp
  lastSeen?: string; // ISO timestamp
  // extra fields allowed
  [key: string]: unknown;
}
