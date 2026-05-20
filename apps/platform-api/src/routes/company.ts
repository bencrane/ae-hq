import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  companyPatchSchema,
  candidateSearchQuerySchema,
  unlockCreateSchema,
  billingCheckoutRequestSchema,
  atsConnectRequestSchema,
  atsVendorSchema,
  deriveSalesMotion,
  companyMatchCriteriaPutSchema,
  companyDiscoverQuerySchema,
  companyExpressInterestSchema,
  type SalesMotion,
} from "@ae-hq/shared";
import { z } from "zod";
import { supabaseAdmin } from "../db";
import type { Variables } from "../middleware";
import {
  runConsentEngine,
  aeSatisfiesCompanyCriteria,
  companySatisfiesAeCriteria,
  type CompanyMatchCriteria,
  type CompanyFacts,
} from "../consent-engine";

// Helper: load the recruiter's company_id from their JWT.
async function loadCompanyId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.company_id ?? null;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

export const companyRoutes = new Hono<{ Variables: Variables }>()
  // GET /api/v1/company/me
  .get("/me", async (c) => {
    const userId = c.get("userId");
    const companyId = await loadCompanyId(userId);
    if (!companyId) return c.json({ error: { code: "not_found", message: "no company membership" } }, 404);
    const { data, error } = await supabaseAdmin.from("companies").select("*").eq("id", companyId).maybeSingle();
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    return c.json({ company: data });
  })
  // PATCH /api/v1/company/me
  .patch("/me", zValidator("json", companyPatchSchema), async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");
    const companyId = await loadCompanyId(userId);
    if (!companyId) return c.json({ error: { code: "not_found", message: "no company membership" } }, 404);
    // verify the user is admin/recruiter — defense in depth
    const { data: mem } = await supabaseAdmin
      .from("company_members")
      .select("role")
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!mem || (mem.role !== "admin" && mem.role !== "recruiter")) {
      return c.json({ error: { code: "forbidden", message: "insufficient role" } }, 403);
    }
    const { data, error } = await supabaseAdmin
      .from("companies")
      .update(body)
      .eq("id", companyId)
      .select("*")
      .maybeSingle();
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    return c.json({ company: data });
  })
  // GET /api/v1/company/candidates  (anonymized search)
  .get("/candidates", zValidator("query", candidateSearchQuerySchema), async (c) => {
    const userId = c.get("userId");
    const companyId = await loadCompanyId(userId);
    if (!companyId) return c.json({ error: { code: "forbidden", message: "no company membership" } }, 403);
    const q = c.req.valid("query");

    // Build candidate query
    let qb = supabaseAdmin
      .from("candidates")
      .select(
        "user_id, headline, segment_focus, methodology, current_company_id, profiles!inner(name), ae_work_history(company_id, start_date, end_date, companies(id, name, logo_url, sales_motion))",
        { count: "exact" },
      );
    if (q.segment) qb = qb.eq("segment_focus", q.segment);
    if (q.methodology) qb = qb.contains("methodology", [q.methodology]);

    // For "worked at X" filter: we filter via a subquery on ae_work_history
    if (q.worked_at) {
      const { data: candIds } = await supabaseAdmin
        .from("ae_work_history")
        .select("candidate_id")
        .eq("company_id", q.worked_at);
      const ids = (candIds ?? []).map((r) => r.candidate_id);
      if (ids.length === 0) {
        return c.json({ candidates: [], total: 0 });
      }
      qb = qb.in("user_id", ids);
    }
    qb = qb.range(q.offset, q.offset + q.limit - 1);
    const { data, error, count } = await qb;
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    type WorkedAtCompany = {
      id: string;
      name: string;
      logo_url: string | null;
      sales_motion: SalesMotion | null;
    };
    type Row = {
      user_id: string;
      headline: string | null;
      segment_focus: string | null;
      methodology: string[];
      current_company_id: string | null;
      profiles: { name: string };
      ae_work_history: {
        start_date: string;
        end_date: string | null;
        companies: WorkedAtCompany | null;
      }[];
    };
    const result = (data as unknown as Row[]).map((row) => {
      const years = Math.max(
        1,
        Math.round(
          row.ae_work_history.reduce((acc, h) => {
            const start = new Date(h.start_date).getTime();
            const end = h.end_date ? new Date(h.end_date).getTime() : Date.now();
            return acc + (end - start) / (1000 * 60 * 60 * 24 * 365);
          }, 0),
        ),
      );
      const workedAt = row.ae_work_history
        .map((h) => h.companies)
        .filter((co): co is WorkedAtCompany => Boolean(co));
      // Derive the candidate's sales motion from their work-history companies.
      const salesMotion = deriveSalesMotion(workedAt.map((co) => co.sales_motion));
      return {
        id: row.user_id,
        initials: initials(row.profiles.name),
        headline: row.headline,
        segment_focus: row.segment_focus,
        methodology: row.methodology,
        years_experience: years,
        current_stage_pattern: row.current_company_id ? "active" : "between roles",
        sales_motion: salesMotion.motion,
        sales_motion_label: salesMotion.label,
        worked_at_companies: workedAt.map((co) => ({
          id: co.id,
          name: co.name,
          logo_url: co.logo_url,
        })),
      };
    });
    return c.json({ candidates: result, total: count ?? result.length });
  })
  // GET /api/v1/company/candidates/:id  (anonymized detail)
  .get("/candidates/:id", async (c) => {
    const userId = c.get("userId");
    const companyId = await loadCompanyId(userId);
    if (!companyId) return c.json({ error: { code: "forbidden", message: "no company membership" } }, 403);
    const id = c.req.param("id");
    const { data: cand, error } = await supabaseAdmin
      .from("candidates")
      .select("*, profiles!inner(name, email)")
      .eq("user_id", id)
      .maybeSingle();
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    if (!cand) return c.json({ error: { code: "not_found", message: "candidate not found" } }, 404);
    // Check unlock state for this company
    const { data: unlock } = await supabaseAdmin
      .from("unlock_requests")
      .select("status")
      .eq("company_id", companyId)
      .eq("candidate_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const isUnlocked = unlock?.status === "accepted";
    const { data: history } = await supabaseAdmin
      .from("ae_work_history")
      .select("*, companies(id, name, logo_url, slug, sales_motion, stage, founded_year)")
      .eq("candidate_id", id)
      .order("start_date", { ascending: false });
    const { data: creds } = await supabaseAdmin
      .from("verified_credentials")
      .select("kind, period_start, period_end, value_json, verification_tier")
      .eq("candidate_id", id);
    type Row = { profiles: { name: string; email: string } };
    const typed = cand as unknown as Row & { headline: string | null; segment_focus: string | null; methodology: string[] };
    // Derive the candidate's sales motion from their work-history companies.
    type HistoryRow = { companies: { sales_motion: SalesMotion | null } | null };
    const workHistory = (history ?? []) as HistoryRow[];
    const salesMotion = deriveSalesMotion(
      workHistory.map((h) => h.companies?.sales_motion ?? null),
    );
    return c.json({
      candidate: {
        id,
        initials: initials(typed.profiles.name),
        headline: typed.headline,
        segment_focus: typed.segment_focus,
        methodology: typed.methodology,
        sales_motion: salesMotion.motion,
        sales_motion_label: salesMotion.label,
        // Reveal email/name only if unlocked
        name: isUnlocked ? typed.profiles.name : null,
        email: isUnlocked ? typed.profiles.email : null,
        is_unlocked: isUnlocked,
        unlock_status: unlock?.status ?? null,
        work_history: history ?? [],
        credentials: creds ?? [],
      },
    });
  })
  // GET /api/v1/company/match-criteria — the company's standing consent.
  .get("/match-criteria", async (c) => {
    const userId = c.get("userId");
    const companyId = await loadCompanyId(userId);
    if (!companyId) return c.json({ error: { code: "forbidden", message: "no company membership" } }, 403);
    const { data, error } = await supabaseAdmin
      .from("company_match_criteria")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    // a company that has never set criteria reads as "no constraint" — return
    // an empty-criteria shape rather than null so the surface always renders.
    return c.json({
      criteria: data ?? {
        company_id: companyId,
        segments: [],
        sales_motions: [],
        min_years_experience: 0,
        worked_at_company_ids: [],
        investor_pedigree: [],
        updated_at: null,
      },
    });
  })
  // PUT /api/v1/company/match-criteria — set the company's standing consent.
  .put("/match-criteria", zValidator("json", companyMatchCriteriaPutSchema), async (c) => {
    const userId = c.get("userId");
    const companyId = await loadCompanyId(userId);
    if (!companyId) return c.json({ error: { code: "forbidden", message: "no company membership" } }, 403);
    const body = c.req.valid("json");
    const { data, error } = await supabaseAdmin
      .from("company_match_criteria")
      .upsert({ company_id: companyId, ...body, updated_at: new Date().toISOString() })
      .select("*")
      .single();
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    return c.json({ criteria: data });
  })
  // POST /api/v1/company/discover — the matchmaking discovery surface.
  // A criteria query returns ANONYMIZED AE cards. Two filters apply:
  //   1. the company's discover query (segment / motion / years / worked-at /
  //      investor) — the recruiter's criteria-builder.
  //   2. the DISCOVERABILITY rule — an AE appears ONLY if that AE is
  //      `discoverable` AND the querying company satisfies the AE's OWN
  //      declared criteria (the AE's criteria double as their exposure
  //      filter). An AE who opts out, or whose criteria exclude the company,
  //      is never surfaced.
  // The card is anonymized: `profiles.name` is derived to initials and DROPPED
  // before serialization — the full name never reaches the JSON.
  .post("/discover", zValidator("json", companyDiscoverQuerySchema), async (c) => {
    const userId = c.get("userId");
    const companyId = await loadCompanyId(userId);
    if (!companyId) return c.json({ error: { code: "forbidden", message: "no company membership" } }, 403);
    const query = c.req.valid("json");

    // the querying company's firmographic facts — the input to each AE's
    // exposure filter.
    const { data: companyRow } = await supabaseAdmin
      .from("companies")
      .select("id, stage, investors")
      .eq("id", companyId)
      .maybeSingle();
    if (!companyRow) {
      return c.json({ error: { code: "not_found", message: "company not found" } }, 404);
    }
    const companyFacts: CompanyFacts = {
      companyId: companyRow.id,
      stage: companyRow.stage ?? null,
      investors: (companyRow.investors ?? []) as string[],
    };

    // load every candidate with their intent + work history in one query.
    const { data: rows, error } = await supabaseAdmin
      .from("candidates")
      .select(
        "user_id, headline, segment_focus, methodology, current_company_id, " +
          "profiles!inner(name), " +
          "intent_signals(target_stages, target_segments, comp_ote_min, target_companies, " +
          "target_investors, watched_companies, auto_match, discoverable), " +
          "ae_work_history(company_id, start_date, end_date, " +
          "companies(id, name, logo_url, sales_motion, investors))",
      );
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);

    type WorkedAtCompany = {
      id: string;
      name: string;
      logo_url: string | null;
      sales_motion: SalesMotion | null;
      investors: string[] | null;
    };
    type IntentRow = {
      target_stages: string[] | null;
      target_segments: string[] | null;
      comp_ote_min: number | null;
      target_companies: string[] | null;
      target_investors: string[] | null;
      watched_companies: string[] | null;
      auto_match: boolean | null;
      discoverable: boolean | null;
    };
    type CandRow = {
      user_id: string;
      headline: string | null;
      segment_focus: string | null;
      methodology: string[];
      current_company_id: string | null;
      profiles: { name: string };
      intent_signals: IntentRow | IntentRow[] | null;
      ae_work_history: {
        company_id: string;
        start_date: string;
        end_date: string | null;
        companies: WorkedAtCompany | null;
      }[];
    };

    const cards = [];
    for (const row of (rows ?? []) as unknown as CandRow[]) {
      // intent_signals is a 1:1 relation but supabase-js types it as an array
      // for an embedded select — normalize to a single row.
      const intentRaw = Array.isArray(row.intent_signals)
        ? row.intent_signals[0]
        : row.intent_signals;
      // an AE who declared NO intent is not discoverable (directive: "an AE
      // who declares nothing / opts out is not discoverable").
      if (!intentRaw) continue;
      // explicit opt-out hides the AE regardless of criteria.
      if (intentRaw.discoverable === false) continue;

      const aeIntent = {
        target_stages: (intentRaw.target_stages ?? []) as string[],
        target_segments: (intentRaw.target_segments ?? []) as string[],
        comp_ote_min: intentRaw.comp_ote_min ?? null,
        target_companies: (intentRaw.target_companies ?? []) as string[],
        target_investors: (intentRaw.target_investors ?? []) as string[],
        watched_companies: (intentRaw.watched_companies ?? []) as string[],
        auto_match: intentRaw.auto_match ?? false,
        discoverable: intentRaw.discoverable ?? true,
      };
      // THE DISCOVERABILITY RULE: the querying company must satisfy the AE's
      // own declared criteria for the AE to be surfaced.
      if (!companySatisfiesAeCriteria(companyFacts, aeIntent)) continue;

      // derive the candidate facts the company's discover-query filters on.
      const workedAt = row.ae_work_history
        .map((h) => h.companies)
        .filter((co): co is WorkedAtCompany => Boolean(co));
      const years = Math.max(
        1,
        Math.round(
          row.ae_work_history.reduce((acc, h) => {
            const start = new Date(h.start_date).getTime();
            const end = h.end_date ? new Date(h.end_date).getTime() : Date.now();
            return acc + (end - start) / (1000 * 60 * 60 * 24 * 365);
          }, 0),
        ),
      );
      const salesMotion = deriveSalesMotion(workedAt.map((co) => co.sales_motion));
      const workedAtCompanyIds = Array.from(new Set(workedAt.map((co) => co.id)));
      const workedAtInvestors = Array.from(
        new Set(workedAt.flatMap((co) => co.investors ?? [])),
      );

      // the company's discover-query criteria — reuse the same predicate the
      // consent engine uses (a query field is just an ad-hoc criteria set).
      const queryCriteria: CompanyMatchCriteria = {
        segments: query.segments ?? [],
        sales_motions: query.sales_motions ?? [],
        min_years_experience: query.min_years_experience ?? 0,
        worked_at_company_ids: query.worked_at_company_ids ?? [],
        investor_pedigree: query.investor_pedigree ?? [],
      };
      const candidateFacts = {
        candidateId: row.user_id,
        segmentFocus: row.segment_focus ?? null,
        salesMotion: salesMotion.motion,
        yearsExperience: years,
        workedAtCompanyIds,
        workedAtInvestors,
      };
      if (!aeSatisfiesCompanyCriteria(candidateFacts, queryCriteria)) continue;

      // ANONYMIZED card — initials only; profiles.name is dropped here and
      // never serialized.
      cards.push({
        candidate_id: row.user_id,
        initials: initials(row.profiles.name),
        headline: row.headline,
        segment_focus: row.segment_focus,
        methodology: row.methodology,
        years_experience: years,
        sales_motion: salesMotion.motion,
        sales_motion_label: salesMotion.label,
        worked_at_companies: workedAt.map((co) => ({
          id: co.id,
          name: co.name,
          logo_url: co.logo_url,
        })),
      });
    }

    return c.json({ candidates: cards, total: cards.length });
  })
  // POST /api/v1/company/candidates/:id/express-interest — company-initiated.
  // The company expresses interest in an AE. This runs the consent engine:
  // the company's consent is explicit (they acted); the AE's consent is
  // standing iff the AE has auto_match=true AND this company satisfies the
  // AE's own declared criteria. Both consented → resolve immediately. AE
  // consent pending → match.status='pending_ae', the AE gets exactly one
  // accept/decline prompt. Idempotent.
  .post(
    "/candidates/:id/express-interest",
    zValidator("json", companyExpressInterestSchema),
    async (c) => {
      const userId = c.get("userId");
      const companyId = await loadCompanyId(userId);
      if (!companyId) return c.json({ error: { code: "forbidden", message: "no company membership" } }, 403);
      const candidateId = c.req.param("id");
      const { job_id } = c.req.valid("json");

      // the candidate must exist.
      const { data: cand } = await supabaseAdmin
        .from("candidates")
        .select("user_id")
        .eq("user_id", candidateId)
        .maybeSingle();
      if (!cand) {
        return c.json({ error: { code: "not_found", message: "candidate not found" } }, 404);
      }

      try {
        const result = await runConsentEngine({
          origin: "company_initiated",
          companyId,
          candidateId,
          jobId: job_id ?? null,
          actorUserId: userId,
        });
        return c.json({
          match: result.match,
          resolved: result.match.status === "resolved",
        });
      } catch (e) {
        return c.json(
          { error: { code: "consent_error", message: (e as Error).message } },
          500,
        );
      }
    },
  )
  // POST /api/v1/company/candidates/:id/unlock
  .post(
    "/candidates/:id/unlock",
    zValidator("json", unlockCreateSchema),
    async (c) => {
      const userId = c.get("userId");
      const companyId = await loadCompanyId(userId);
      if (!companyId) return c.json({ error: { code: "forbidden", message: "no company membership" } }, 403);
      const candidateId = c.req.param("id");
      const body = c.req.valid("json");
      // Check active subscription
      const { data: sub } = await supabaseAdmin
        .from("subscriptions")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();
      if (!sub) return c.json({ error: { code: "no_subscription", message: "no active subscription" } }, 402);
      if (sub.unlocks_used_current_period >= sub.unlocks_per_month) {
        return c.json({ error: { code: "budget_exhausted", message: "unlock budget exhausted" } }, 402);
      }
      // MOCK Stripe charge
      const mockChargeId = `mock_ch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      // Check for existing pending/accepted
      const { data: existing } = await supabaseAdmin
        .from("unlock_requests")
        .select("*")
        .eq("company_id", companyId)
        .eq("candidate_id", candidateId)
        .in("status", ["pending", "accepted"])
        .maybeSingle();
      let unlock = existing;
      if (!existing) {
        const { data: created, error } = await supabaseAdmin
          .from("unlock_requests")
          .insert({
            company_id: companyId,
            candidate_id: candidateId,
            status: "pending",
            message: body.message,
            mock_stripe_charge_id: mockChargeId,
          })
          .select("*")
          .single();
        if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
        unlock = created;
        // increment budget
        await supabaseAdmin
          .from("subscriptions")
          .update({ unlocks_used_current_period: sub.unlocks_used_current_period + 1 })
          .eq("company_id", companyId);
        // notify candidate
        const { data: company } = await supabaseAdmin
          .from("companies")
          .select("slug, name")
          .eq("id", companyId)
          .single();
        await supabaseAdmin.from("notifications").insert({
          user_id: candidateId,
          kind: "unlock_requested",
          payload_json: {
            company_slug: company?.slug ?? "",
            company_name: company?.name ?? "",
            unlock_request_id: created.id,
          },
        });
        // cycle-6: an unlock is a company-initiated interest action. Run the
        // consent engine alongside the unlock_request so the company-initiated
        // path produces a `matches` row (origin=company_initiated). The
        // engine resolves the match if the AE's standing consent is granted
        // (auto_match on + criteria fit), else records pending_ae. The
        // unlock_request stays the payment artifact; matches is the spine.
        try {
          await runConsentEngine({
            origin: "company_initiated",
            companyId,
            candidateId,
            jobId: null,
            actorUserId: userId,
          });
        } catch (e) {
          // do not fail the unlock on a consent-engine error — the
          // unlock_request is already created; a later express-interest can
          // reconcile the match via the idempotent engine path.
          c.get("log").warn({ err: (e as Error).message }, "unlock consent-engine failed");
        }
      }
      const remaining = sub.unlocks_per_month - sub.unlocks_used_current_period - (existing ? 0 : 1);
      return c.json({
        unlock_request: unlock,
        budget_remaining: Math.max(0, remaining),
        mock_stripe_charge_id: mockChargeId,
      });
    },
  )
  // GET /api/v1/company/billing
  .get("/billing", async (c) => {
    const userId = c.get("userId");
    const companyId = await loadCompanyId(userId);
    if (!companyId) return c.json({ error: { code: "forbidden", message: "no company membership" } }, 403);
    const { data } = await supabaseAdmin.from("subscriptions").select("*").eq("company_id", companyId).maybeSingle();
    return c.json({ subscription: data ?? null });
  })
  // POST /api/v1/company/billing/checkout  (MOCKED)
  .post(
    "/billing/checkout",
    zValidator("json", billingCheckoutRequestSchema),
    async (c) => {
      const userId = c.get("userId");
      const companyId = await loadCompanyId(userId);
      if (!companyId) return c.json({ error: { code: "forbidden", message: "no company membership" } }, 403);
      const body = c.req.valid("json");
      // TODO(cycle-2): real Stripe checkout session
      const mockSessionId = `cs_mock_${crypto.randomUUID()}`;
      const unlocksByTier: Record<string, number> = { starter: 10, growth: 25, scale: 60 };
      const unlocks = unlocksByTier[body.tier] ?? 10;
      await supabaseAdmin
        .from("subscriptions")
        .upsert({
          company_id: companyId,
          tier: body.tier,
          unlocks_per_month: unlocks,
          unlocks_used_current_period: 0,
          stripe_subscription_id: `mock_sub_${body.tier}_${Date.now()}`,
        });
      return c.json({
        mock_checkout_url: `https://mock-stripe.test/checkout/${mockSessionId}`,
        mock_session_id: mockSessionId,
      });
    },
  )
  // GET /api/v1/company/ats
  .get("/ats", async (c) => {
    const userId = c.get("userId");
    const companyId = await loadCompanyId(userId);
    if (!companyId) return c.json({ error: { code: "forbidden", message: "no company membership" } }, 403);
    const { data } = await supabaseAdmin.from("ats_connections").select("*").eq("company_id", companyId);
    const vendors: ("greenhouse" | "lever" | "ashby" | "rippling" | "bamboohr")[] = [
      "greenhouse",
      "lever",
      "ashby",
      "rippling",
      "bamboohr",
    ];
    const connections = vendors.map((v) => {
      const found = (data ?? []).find((r) => r.vendor === v);
      return {
        company_id: companyId,
        vendor: v,
        last_synced_at: found?.last_synced_at ?? null,
        is_connected: Boolean(found?.encrypted_credentials),
      };
    });
    return c.json({ connections });
  })
  // POST /api/v1/company/ats/:vendor/connect
  .post(
    "/ats/:vendor/connect",
    zValidator("json", atsConnectRequestSchema),
    zValidator("param", z.object({ vendor: atsVendorSchema })),
    async (c) => {
      const userId = c.get("userId");
      const companyId = await loadCompanyId(userId);
      if (!companyId) return c.json({ error: { code: "forbidden", message: "no company membership" } }, 403);
      const { vendor } = c.req.valid("param");
      // TODO(cycle-2): real encryption via AE_CREDENTIALS_ENCRYPTION_KEY
      const { data, error } = await supabaseAdmin
        .from("ats_connections")
        .upsert({
          company_id: companyId,
          vendor,
          encrypted_credentials: "mock_encrypted",
          last_synced_at: new Date().toISOString(),
        })
        .select("*")
        .single();
      if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
      return c.json({
        connection: {
          company_id: companyId,
          vendor,
          last_synced_at: data.last_synced_at,
          is_connected: true,
        },
      });
    },
  )
  // POST /api/v1/company/ats/:vendor/disconnect
  .post(
    "/ats/:vendor/disconnect",
    zValidator("param", z.object({ vendor: atsVendorSchema })),
    async (c) => {
      const userId = c.get("userId");
      const companyId = await loadCompanyId(userId);
      if (!companyId) return c.json({ error: { code: "forbidden", message: "no company membership" } }, 403);
      const { vendor } = c.req.valid("param");
      await supabaseAdmin.from("ats_connections").delete().eq("company_id", companyId).eq("vendor", vendor);
      return c.json({ ok: true as const });
    },
  );
