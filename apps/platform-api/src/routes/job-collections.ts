/**
 * job-collections — curated collections of jobs grouped by a coherent
 * firmographic axis (cycle 5, directive item #4).
 *
 * Collections are computed from the firmographic data landed in cycle 4. There
 * is NO `industry` column on `companies` (validator prediction p4) — the axes
 * here use only columns that exist: `sales_motion`, `stage` (funding stage),
 * and `investors`. Each collection is a titled group of job cards.
 *
 * A collection is only emitted if it has >= 1 matching job, so the candidate
 * never sees an empty card group (criterion 10 requires >= 2 titled groups,
 * each with >= 1 card).
 */

import type { JobCollection, CollectionJob } from "@ae-hq/shared";
import { supabaseAdmin } from "../db";

type JobWithCompanyRow = {
  id: string;
  title: string;
  segment: string;
  stage: string;
  location: string;
  is_remote: boolean;
  ote_min: number;
  ote_max: number;
  companies: {
    id: string;
    slug: string;
    name: string;
    logo_url: string | null;
    sales_motion: string | null;
    stage: string | null;
    investors: string[] | null;
  };
};

type CollectionResult =
  | { ok: true; collections: JobCollection[] }
  | { ok: false; message: string };

// A collection definition: an id/title/subtitle and a predicate over the job's
// company firmographics. The first matching definitions with >= 1 job win.
type CollectionDef = {
  id: string;
  title: string;
  subtitle: string;
  match: (company: JobWithCompanyRow["companies"]) => boolean;
};

const COLLECTION_DEFS: CollectionDef[] = [
  {
    id: "plg-companies",
    title: "PLG companies hiring AEs",
    subtitle: "Product-led growth — the product lands itself; you expand it.",
    match: (co) => co.sales_motion === "plg",
  },
  {
    id: "enterprise-motion",
    title: "Enterprise sales motions",
    subtitle: "Consultative, multi-stakeholder, six-figure deal cycles.",
    match: (co) => co.sales_motion === "enterprise",
  },
  {
    id: "series-b",
    title: "Series B companies",
    subtitle: "Past product-market fit, scaling the go-to-market engine.",
    match: (co) => co.stage === "SeriesB",
  },
  {
    id: "series-d-and-public",
    title: "Late-stage & public companies",
    subtitle: "Series D and public — established quota, mature comp plans.",
    match: (co) => co.stage === "SeriesD" || co.stage === "Public",
  },
  {
    id: "sequoia-backed",
    title: "Sequoia-backed companies",
    subtitle: "Roles at companies in the Sequoia Capital portfolio.",
    match: (co) => (co.investors ?? []).includes("Sequoia Capital"),
  },
  {
    id: "a16z-backed",
    title: "Andreessen Horowitz-backed companies",
    subtitle: "Roles at companies in the a16z portfolio.",
    match: (co) => (co.investors ?? []).includes("Andreessen Horowitz"),
  },
];

/**
 * Build the curated job collections. `candidateId` is optional — when present,
 * each card carries an `applied` flag (the candidate's own applications).
 */
export async function buildJobCollections(
  candidateId: string | null,
): Promise<CollectionResult> {
  const { data, error } = await supabaseAdmin
    .from("jobs")
    .select(
      "id, title, segment, stage, location, is_remote, ote_min, ote_max, " +
        "companies!inner(id, slug, name, logo_url, sales_motion, stage, investors)",
    )
    .order("posted_at", { ascending: false });
  if (error) return { ok: false, message: error.message };

  const jobs = (data ?? []) as unknown as JobWithCompanyRow[];

  // the candidate's applied job ids — one query, used to flag every card.
  const appliedJobIds = new Set<string>();
  if (candidateId) {
    const { data: apps } = await supabaseAdmin
      .from("applications")
      .select("job_id")
      .eq("candidate_id", candidateId);
    for (const a of apps ?? []) appliedJobIds.add((a as { job_id: string }).job_id);
  }

  const toCard = (j: JobWithCompanyRow): CollectionJob => ({
    id: j.id,
    title: j.title,
    segment: j.segment,
    stage: j.stage,
    location: j.location,
    is_remote: j.is_remote,
    ote_min: j.ote_min,
    ote_max: j.ote_max,
    applied: appliedJobIds.has(j.id),
    company: {
      id: j.companies.id,
      slug: j.companies.slug,
      name: j.companies.name,
      logo_url: j.companies.logo_url,
      sales_motion: j.companies.sales_motion,
      stage: j.companies.stage,
    },
  });

  const collections: JobCollection[] = [];
  for (const def of COLLECTION_DEFS) {
    // cap each collection at 12 cards so the row stays a browsable strip.
    const matched = jobs.filter((j) => def.match(j.companies)).slice(0, 12);
    if (matched.length === 0) continue;
    collections.push({
      id: def.id,
      title: def.title,
      subtitle: def.subtitle,
      jobs: matched.map(toCard),
    });
  }

  return { ok: true, collections };
}
