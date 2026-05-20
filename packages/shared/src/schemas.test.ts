/// <reference types="bun-types" />
import { describe, expect, it } from "bun:test";
import {
  candidateSchema,
  intentSignalSchema,
  jobSchema,
  methodologySchema,
  profileKindSchema,
  segmentSchema,
} from "./index";

describe("@ae-hq/shared schemas", () => {
  it("jobSchema validates a well-formed job", () => {
    const valid = {
      id: "00000000-0000-0000-0000-000000000001",
      company_id: "00000000-0000-0000-0000-000000000002",
      title: "Enterprise AE",
      segment: "Enterprise" as const,
      ote_min: 240_000,
      ote_max: 320_000,
      base_min: 130_000,
      base_max: 175_000,
      deal_size_avg: 250_000,
      sales_cycle_days: 90,
      methodology: "MEDDPICC" as const,
      stack: ["Salesforce", "Gong"],
      stage: "SeriesC" as const,
      location: "Remote",
      is_remote: true,
      posted_at: "2026-05-19T00:00:00Z",
    };
    expect(() => jobSchema.parse(valid)).not.toThrow();
  });

  it("segment + methodology + profile_kind enum schemas reject unknown values", () => {
    expect(() => segmentSchema.parse("FreeFall")).toThrow();
    expect(() => methodologySchema.parse("Manifestation")).toThrow();
    expect(() => profileKindSchema.parse("ghost")).toThrow();
  });

  it("candidate + intent schemas accept default-empty arrays", () => {
    const c = candidateSchema.parse({
      user_id: "00000000-0000-0000-0000-000000000003",
      headline: null,
      linkedin_url: null,
      segment_focus: null,
      methodology: [],
      current_company_id: null,
    });
    expect(c.methodology).toEqual([]);
    const i = intentSignalSchema.parse({
      candidate_id: "00000000-0000-0000-0000-000000000003",
      target_stages: [],
      target_segments: [],
      comp_ote_min: null,
      target_geos: [],
      target_companies: [],
      updated_at: "2026-05-19T00:00:00Z",
    });
    expect(i.target_companies).toEqual([]);
  });
});
