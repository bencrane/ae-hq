/**
 * Unit tests for the consent engine's deterministic predicate evaluator.
 *
 * These exercise the PURE predicate functions — `aeSatisfiesCompanyCriteria`
 * and `companySatisfiesAeCriteria` — with no DB. The three end-to-end consent
 * resolution paths (with the live BFF) are covered by
 * scripts/benchmarks/check-consent-engine.ts.
 *
 * Matching is a deterministic predicate filter — these tests assert the
 * boolean predicate, never an ordering or a score.
 */

import { describe, it, expect } from "bun:test";
import {
  aeSatisfiesCompanyCriteria,
  companySatisfiesAeCriteria,
  type CandidateFacts,
  type CompanyMatchCriteria,
  type AeIntent,
  type CompanyFacts,
} from "../src/consent-engine";

// ── fixtures ──────────────────────────────────────────────────────────────

const candidate: CandidateFacts = {
  candidateId: "cand-1",
  segmentFocus: "Enterprise",
  salesMotion: "enterprise",
  yearsExperience: 7,
  workedAtCompanyIds: ["co-stripe", "co-plaid"],
  workedAtInvestors: ["Sequoia Capital", "Andreessen Horowitz"],
};

/** A criteria object with every dimension empty — "no constraint". */
const emptyCriteria: CompanyMatchCriteria = {
  segments: [],
  sales_motions: [],
  min_years_experience: 0,
  worked_at_company_ids: [],
  investor_pedigree: [],
};

const aeIntent: AeIntent = {
  target_stages: ["SeriesB", "SeriesC"],
  target_segments: ["Enterprise"],
  comp_ote_min: 250000,
  target_companies: [],
  target_investors: ["Sequoia Capital"],
  watched_companies: [],
  auto_match: true,
  discoverable: true,
};

const company: CompanyFacts = {
  companyId: "co-1",
  stage: "SeriesB",
  investors: ["Sequoia Capital", "Index Ventures"],
};

// ── aeSatisfiesCompanyCriteria ──────────────────────────────────────────────

describe("aeSatisfiesCompanyCriteria", () => {
  it("empty criteria — no constraint — any AE satisfies", () => {
    expect(aeSatisfiesCompanyCriteria(candidate, emptyCriteria)).toBe(true);
  });

  it("segment match passes; segment mismatch fails", () => {
    expect(
      aeSatisfiesCompanyCriteria(candidate, { ...emptyCriteria, segments: ["Enterprise"] }),
    ).toBe(true);
    expect(
      aeSatisfiesCompanyCriteria(candidate, { ...emptyCriteria, segments: ["SMB"] }),
    ).toBe(false);
  });

  it("sales-motion match passes; mismatch fails", () => {
    expect(
      aeSatisfiesCompanyCriteria(candidate, { ...emptyCriteria, sales_motions: ["enterprise"] }),
    ).toBe(true);
    expect(
      aeSatisfiesCompanyCriteria(candidate, { ...emptyCriteria, sales_motions: ["plg"] }),
    ).toBe(false);
  });

  it("years floor — at or above passes, below fails", () => {
    expect(
      aeSatisfiesCompanyCriteria(candidate, { ...emptyCriteria, min_years_experience: 7 }),
    ).toBe(true);
    expect(
      aeSatisfiesCompanyCriteria(candidate, { ...emptyCriteria, min_years_experience: 8 }),
    ).toBe(false);
  });

  it("worked-at intersection — present passes, absent fails", () => {
    expect(
      aeSatisfiesCompanyCriteria(candidate, {
        ...emptyCriteria,
        worked_at_company_ids: ["co-stripe"],
      }),
    ).toBe(true);
    expect(
      aeSatisfiesCompanyCriteria(candidate, {
        ...emptyCriteria,
        worked_at_company_ids: ["co-datadog"],
      }),
    ).toBe(false);
  });

  it("investor pedigree — intersection passes, no overlap fails", () => {
    expect(
      aeSatisfiesCompanyCriteria(candidate, {
        ...emptyCriteria,
        investor_pedigree: ["Sequoia Capital"],
      }),
    ).toBe(true);
    expect(
      aeSatisfiesCompanyCriteria(candidate, {
        ...emptyCriteria,
        investor_pedigree: ["Khosla Ventures"],
      }),
    ).toBe(false);
  });

  it("every dimension is an AND — one failing dimension fails the whole predicate", () => {
    // segment + motion + years all pass, but worked-at does not.
    expect(
      aeSatisfiesCompanyCriteria(candidate, {
        segments: ["Enterprise"],
        sales_motions: ["enterprise"],
        min_years_experience: 5,
        worked_at_company_ids: ["co-datadog"],
        investor_pedigree: [],
      }),
    ).toBe(false);
  });

  it("a candidate with no segment_focus fails a segment constraint", () => {
    const noSegment: CandidateFacts = { ...candidate, segmentFocus: null };
    expect(
      aeSatisfiesCompanyCriteria(noSegment, { ...emptyCriteria, segments: ["Enterprise"] }),
    ).toBe(false);
  });
});

// ── companySatisfiesAeCriteria ──────────────────────────────────────────────

describe("companySatisfiesAeCriteria", () => {
  it("empty AE criteria — no constraint — any company satisfies", () => {
    const open: AeIntent = {
      ...aeIntent,
      target_stages: [],
      target_investors: [],
    };
    expect(companySatisfiesAeCriteria(company, open)).toBe(true);
  });

  it("stage in target_stages passes; stage not in it fails", () => {
    expect(companySatisfiesAeCriteria(company, { ...aeIntent, target_investors: [] })).toBe(true);
    expect(
      companySatisfiesAeCriteria(
        { ...company, stage: "Public" },
        { ...aeIntent, target_investors: [] },
      ),
    ).toBe(false);
  });

  it("investor intersection passes; no overlap fails", () => {
    expect(companySatisfiesAeCriteria(company, { ...aeIntent, target_stages: [] })).toBe(true);
    expect(
      companySatisfiesAeCriteria(
        { ...company, investors: ["Khosla Ventures"] },
        { ...aeIntent, target_stages: [] },
      ),
    ).toBe(false);
  });

  it("explicitly naming the company (target_companies) widens the gate — stage/investor are bypassed", () => {
    // company is Public + Khosla-backed — would fail stage AND investor — but
    // the AE explicitly listed it, so the exposure filter admits it.
    const named: AeIntent = {
      ...aeIntent,
      target_companies: ["co-1"],
    };
    expect(
      companySatisfiesAeCriteria(
        { companyId: "co-1", stage: "Public", investors: ["Khosla Ventures"] },
        named,
      ),
    ).toBe(true);
  });

  it("watching the company (watched_companies) also widens the gate", () => {
    const watched: AeIntent = {
      ...aeIntent,
      watched_companies: ["co-1"],
    };
    expect(
      companySatisfiesAeCriteria(
        { companyId: "co-1", stage: "Public", investors: [] },
        watched,
      ),
    ).toBe(true);
  });

  it("stage AND investor are both required when the company is not explicitly named", () => {
    // stage passes (SeriesB) but investor does not overlap.
    expect(
      companySatisfiesAeCriteria(
        { companyId: "co-1", stage: "SeriesB", investors: ["Khosla Ventures"] },
        aeIntent,
      ),
    ).toBe(false);
  });
});
