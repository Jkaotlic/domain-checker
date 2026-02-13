import punycode from "punycode";
import psl from "psl";

/**
 * Normalize an input string to a host (ASCII/punycode), lowercase, stripped of protocol/path/port.
 * Returns the ASCII host or throws Error if can't parse.
 */
export function normalizeDomain(input: string): string {
  if (!input || typeof input !== "string") {
    throw new Error("Invalid input");
  }

  let s = input.trim();

  // If it's like "example.com/path" or "http://example.com", ensure URL can parse
  try {
    // If missing protocol, add dummy so URL parses
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) {
      s = "http://" + s;
    }
    const url = new URL(s);
    const hostname = url.hostname;

    // Convert to ASCII (punycode) and lowercase
    const ascii = punycode.toASCII(hostname).toLowerCase();

    // strip surrounding dots
    return ascii.replace(/^\.+|\.+$/g, "");
  } catch (err) {
    // Fallback: treat as bare host (no protocol)
    let host = s;
    // strip possible path/port if someone passed "example.com:8080/path"
    const m = host.match(/^([^\/ :]+)(?::\d+)?(?:\/.*)?$/);
    if (m) {
      host = m[1];
      const ascii = punycode.toASCII(host).toLowerCase();
      return ascii.replace(/^\.+|\.+$/g, "");
    }
    throw new Error("Unable to normalize domain");
  }
}

/**
 * Basic host validation using psl.parse to check domain extraction.
 */
export function isValidHost(host: string): boolean {
  if (!host || typeof host !== "string") return false;
  const cleaned = host.trim().toLowerCase();
  // Reject spaces and control characters
  if (/\s/.test(cleaned)) return false;
  // Convert to ASCII for validation
  let ascii: string;
  try {
    ascii = punycode.toASCII(cleaned);
  } catch {
    return false;
  }
  // Host must be <= 255
  if (ascii.length > 255) return false;

  const parsed = psl.parse(ascii);
  // psl.parse returns {domain: null} for invalid public suffix / hostnames
  return !!parsed.domain;
}
