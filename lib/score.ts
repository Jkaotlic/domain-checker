import { SubdomainEntry } from "./types";

// Default source weights reflecting authority/confidence (0-100)
export const DEFAULT_SOURCE_WEIGHTS: Record<string, number> = {
  "zone-transfer": 100,
  authoritative: 70,
  "active-scan": 60,
  crtsh: 50,
  "passive-scan": 30,
  manual: 10,
};

// Scoring component weights (as described in the plan)
export const SCORE_WEIGHTS = {
  w_s: 40, // source weight
  w_f: 15, // frequency (unique sources)
  w_d: 25, // dns consistency (ips)
  w_p: 15, // ptr match
  w_t: 5, // penalty for suspicious tags
};

const MAX_SOURCE_WEIGHT = 100; // used to normalize source weights
const FREQUENCY_NORMALIZER = Math.log(1 + 10); // assume 10 sources saturates contribution

function clamp01(n: number) {
  if (Number.isNaN(n) || !isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Classify numeric score into a bucket.
 * @param score number between 0 and 1
 * @returns 'high' | 'medium' | 'low'
 */
export function classifyScore(score: number): "high" | "medium" | "low" {
  if (score >= 0.7) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

/**
 * Compute an aggregated confidence score for a SubdomainEntry.
 * The returned score is normalized to [0,1].
 * Formula (linear combination):
 * score = (w_s*S + w_f*log(1+F) + w_d*D + w_p*P - w_t*T) / (w_s+w_f+w_d+w_p+w_t)
 * where:
 *  - S = normalized best source weight (0..1)
 *  - F = number of unique sources (log-normalized)
 *  - D = DNS consistency (based on ips count)
 *  - P = PTR evidence (1 if present else 0)
 *  - T = suspicious tag penalty (0..1)
 *
 * @param entry SubdomainEntry to score
 * @param sourceWeights optional custom source weight mapping
 */
export function computeScore(
  entry: SubdomainEntry,
  sourceWeights: Record<string, number> = DEFAULT_SOURCE_WEIGHTS
): number {
  const { w_s, w_f, w_d, w_p, w_t } = SCORE_WEIGHTS;

  // Sources list -> unique source names
  const srcNames = Array.from(
    new Set((entry.sources || []).map((s) => (s && s.source ? s.source : String(s))))
  );

  // S: choose the max configured weight among observed sources (authoritative suffices)
  let bestWeight = 0;
  for (const s of srcNames) {
    const key = String(s).toLowerCase();
    const w = sourceWeights[key] ?? sourceWeights[String(s)] ?? 0;
    if (w > bestWeight) bestWeight = w;
  }
  const S = clamp01(bestWeight / MAX_SOURCE_WEIGHT);

  // F: frequency - number of unique sources, log-normalized
  const F_raw = srcNames.length;
  const F = clamp01(Math.log(1 + F_raw) / FREQUENCY_NORMALIZER);

  // D: DNS consistency: prefer at least one IP; saturate at 3+ IPs
  const ips = Array.isArray(entry.ips) ? entry.ips.filter(Boolean) : [];
  const D = clamp01(ips.length > 0 ? Math.min(1, ips.length / 3) : 0);

  // P: PTR evidence — look for explicit metadata or tags indicating PTR match
  let P = 0;
  for (const s of entry.sources || []) {
    const meta = s && (s as any).metadata;
    if (meta && (meta.ptr === true || meta.ptrMatch === true || meta.ptrMatched === true)) {
      P = 1;
      break;
    }
    const name = (s && s.source) || "";
    if (String(name).toLowerCase().includes("ptr")) {
      P = 1;
      break;
    }
  }
  // also respect tags
  if (!P && Array.isArray(entry.tags)) {
    for (const t of entry.tags) {
      const tt = String(t).toLowerCase();
      if (tt.includes("ptr") || tt.includes("reverse")) {
        P = 1;
        break;
      }
    }
  }

  // T: suspicious tags penalty (wildcard, underscore, suspicious)
  let T = 0;
  if (Array.isArray(entry.tags)) {
    const suspicious = ["wildcard", "underscore", "suspicious", "typo", "invalid"];
    let count = 0;
    for (const t of entry.tags) {
      if (suspicious.includes(String(t).toLowerCase())) count += 1;
    }
    // normalize penalty to [0,1] where 2+ suspicious tags caps penalty
    T = clamp01(count / 2);
  }

  const numerator = w_s * S + w_f * F + w_d * D + w_p * P - w_t * T;
  const denom = w_s + w_f + w_d + w_p + w_t;

  const raw = numerator / denom;
  return clamp01(raw);
}

export default computeScore;
