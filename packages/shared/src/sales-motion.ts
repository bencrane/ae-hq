/**
 * Sales-motion derivation.
 *
 * A candidate does not declare a sales motion — it is DERIVED from the motions of
 * the companies in their work history. An AE who spent their career at enterprise
 * sellers has an "Enterprise sales" profile; one who bounced between PLG companies
 * reads "Product-led sales". A genuinely mixed history reads "Hybrid".
 *
 * `deriveSalesMotion` takes the per-work-history-row sales motions and returns a
 * single derived motion code plus a human-readable label. Each work-history row
 * is one vote — a candidate with three enterprise employers leans enterprise.
 */

import type { SalesMotion } from "./schemas/common";

export type DerivedSalesMotion = {
  /** The dominant motion code, or null if the work history has no motion data. */
  motion: SalesMotion | null;
  /** Human-readable label for the profile/card, e.g. "Enterprise sales". */
  label: string;
};

const MOTION_LABEL: Record<SalesMotion, string> = {
  plg: "Product-led sales",
  sales_led: "Sales-led motion",
  enterprise: "Enterprise sales",
  hybrid: "Hybrid sales motion",
};

// When no single motion reaches this share of the work history, the candidate
// reads as "Hybrid" — a genuinely mixed background, not a specialist.
const DOMINANCE_THRESHOLD = 0.6;

/**
 * Derive a candidate's sales-motion profile from the motions of the companies
 * in their work history.
 *
 * @param motions one entry per work-history row — the `sales_motion` of the
 *   company at that row. `null`/`undefined` entries (a company with no motion
 *   tagged) are ignored.
 */
export function deriveSalesMotion(
  motions: ReadonlyArray<SalesMotion | null | undefined>,
): DerivedSalesMotion {
  const present = motions.filter((m): m is SalesMotion => m != null);
  if (present.length === 0) {
    return { motion: null, label: "Sales motion not yet established" };
  }

  const counts = new Map<SalesMotion, number>();
  for (const m of present) {
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }

  // If the candidate worked at companies explicitly tagged `hybrid`, that
  // already IS a mixed signal — fold it into the same bucket as a tie.
  let topMotion: SalesMotion = "hybrid";
  let topCount = 0;
  for (const [motion, count] of counts) {
    if (count > topCount) {
      topMotion = motion;
      topCount = count;
    }
  }

  const dominant = topCount / present.length >= DOMINANCE_THRESHOLD;
  const motion: SalesMotion = dominant ? topMotion : "hybrid";
  return { motion, label: MOTION_LABEL[motion] };
}
