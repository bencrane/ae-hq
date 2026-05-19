#!/usr/bin/env bun
// Seed script for ae-hq cycle 1.
// Populates: 20 companies, 50 jobs, 100 candidates with work history,
// plus 2 test users (candidate1@accountexecutive.test, recruiter1@stripe.test).

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const SUPABASE_URL = process.env.AE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.AE_SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.AE_DB_DIRECT_URL;

if (!SUPABASE_URL || !SERVICE_ROLE || !DB_URL) {
  console.error("missing AE_SUPABASE_URL / AE_SUPABASE_SERVICE_ROLE_KEY / AE_DB_DIRECT_URL");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const sql = postgres(DB_URL, { ssl: "prefer" });

const COMPANIES = [
  { slug: "stripe", name: "Stripe", domain: "stripe.com", hq: "San Francisco, CA", stage: "Public", size: "1001+" },
  { slug: "snowflake", name: "Snowflake", domain: "snowflake.com", hq: "Bozeman, MT", stage: "Public", size: "1001+" },
  { slug: "mongodb", name: "MongoDB", domain: "mongodb.com", hq: "New York, NY", stage: "Public", size: "1001+" },
  { slug: "datadog", name: "Datadog", domain: "datadoghq.com", hq: "New York, NY", stage: "Public", size: "1001+" },
  { slug: "hashicorp", name: "HashiCorp", domain: "hashicorp.com", hq: "San Francisco, CA", stage: "Public", size: "1001+" },
  { slug: "plaid", name: "Plaid", domain: "plaid.com", hq: "San Francisco, CA", stage: "SeriesD", size: "501-1000" },
  { slug: "vercel", name: "Vercel", domain: "vercel.com", hq: "San Francisco, CA", stage: "SeriesD", size: "201-500" },
  { slug: "linear", name: "Linear", domain: "linear.app", hq: "San Francisco, CA", stage: "SeriesB", size: "51-200" },
  { slug: "notion", name: "Notion", domain: "notion.so", hq: "San Francisco, CA", stage: "SeriesC", size: "501-1000" },
  { slug: "anthropic", name: "Anthropic", domain: "anthropic.com", hq: "San Francisco, CA", stage: "SeriesD", size: "501-1000" },
  { slug: "openai", name: "OpenAI", domain: "openai.com", hq: "San Francisco, CA", stage: "SeriesD", size: "1001+" },
  { slug: "ramp", name: "Ramp", domain: "ramp.com", hq: "New York, NY", stage: "SeriesD", size: "501-1000" },
  { slug: "brex", name: "Brex", domain: "brex.com", hq: "San Francisco, CA", stage: "SeriesD", size: "501-1000" },
  { slug: "mercury", name: "Mercury", domain: "mercury.com", hq: "San Francisco, CA", stage: "SeriesB", size: "201-500" },
  { slug: "retool", name: "Retool", domain: "retool.com", hq: "San Francisco, CA", stage: "SeriesC", size: "201-500" },
  { slug: "render", name: "Render", domain: "render.com", hq: "San Francisco, CA", stage: "SeriesB", size: "51-200" },
  { slug: "modal", name: "Modal", domain: "modal.com", hq: "New York, NY", stage: "SeriesA", size: "11-50" },
  { slug: "replit", name: "Replit", domain: "replit.com", hq: "San Francisco, CA", stage: "SeriesB", size: "201-500" },
  { slug: "cursor", name: "Cursor", domain: "cursor.sh", hq: "San Francisco, CA", stage: "SeriesB", size: "51-200" },
  { slug: "supabase", name: "Supabase", domain: "supabase.com", hq: "Remote", stage: "SeriesB", size: "51-200" },
];

const SEGMENTS = ["SMB", "MidMarket", "Enterprise", "StrategicEnterprise"] as const;
const METHODOLOGIES = ["MEDDIC", "MEDDPICC", "ChallengerSale", "SPIN", "Sandler", "BANT", "CommandOfMessage"] as const;
const STACKS = ["Salesforce", "HubSpot", "Gong", "Outreach", "Salesloft", "ZoomInfo", "Apollo", "Clari", "Chorus"];
const FIRST_NAMES = ["Sarah", "Michael", "Jessica", "David", "Emily", "James", "Ashley", "Christopher", "Amanda", "Daniel", "Stephanie", "Matthew", "Lauren", "Joshua", "Nicole", "Andrew", "Rachel", "Brandon", "Megan", "Tyler"];
const LAST_NAMES = ["Anderson", "Brown", "Davis", "Garcia", "Harris", "Johnson", "Jones", "Lee", "Martin", "Martinez", "Miller", "Moore", "Robinson", "Smith", "Taylor", "Thomas", "Thompson", "White", "Williams", "Wilson"];

function rand<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randDate(yearsAgo: number) {
  const ms = Date.now() - randInt(0, yearsAgo * 365) * 86400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

async function ensureUser(email: string, password: string, name: string, kind: "candidate" | "company_member" | "admin") {
  const list = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (list.error) throw list.error;
  let user = list.data.users.find((u) => u.email === email);
  if (!user) {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (created.error) throw created.error;
    user = created.data.user;
  } else {
    // Reset password to known value so test users are always reachable
    const upd = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    if (upd.error) throw upd.error;
  }
  if (!user) throw new Error(`failed to ensure user ${email}`);
  await sql`
    insert into public.profiles (user_id, kind, email, name)
    values (${user.id}::uuid, ${kind}, ${email}, ${name})
    on conflict (user_id) do update set kind = excluded.kind, email = excluded.email, name = excluded.name
  `;
  return user.id;
}

async function main() {
  console.log("ae-hq seed starting");

  // ----- wipe existing rows (test data only — auth.users left alone except for resets) -----
  await sql`truncate table public.notifications, public.unlock_requests, public.verified_credentials, public.credential_uploads, public.intent_signals, public.ae_work_history, public.jobs, public.subscriptions, public.ats_connections, public.candidates, public.company_members, public.companies restart identity cascade`;
  console.log("  cleared existing tables");

  // ----- companies -----
  const companyIds = new Map<string, string>();
  for (const c of COMPANIES) {
    const [row] = await sql<{ id: string }[]>`
      insert into public.companies (slug, name, domain, logo_url, hq_location, size_range, stage, description, is_claimed, is_subscribed)
      values (
        ${c.slug}, ${c.name}, ${c.domain},
        ${`https://logo.clearbit.com/${c.domain}`},
        ${c.hq}, ${c.size}, ${c.stage},
        ${`${c.name} is hiring AEs to drive growth into ${rand(SEGMENTS)} accounts.`},
        ${c.slug === "stripe"}, ${c.slug === "stripe"}
      )
      returning id
    `;
    companyIds.set(c.slug, row!.id);
  }
  console.log(`  seeded ${companyIds.size} companies`);

  // ----- jobs (50 across companies) -----
  let jobCount = 0;
  for (const c of COMPANIES) {
    const numJobs = randInt(1, 4);
    for (let i = 0; i < numJobs && jobCount < 50; i++) {
      const segment = rand(SEGMENTS);
      const oteMin = segment === "SMB" ? 120_000 : segment === "MidMarket" ? 180_000 : segment === "Enterprise" ? 240_000 : 300_000;
      const oteMax = oteMin + randInt(40_000, 80_000);
      const baseMin = Math.floor(oteMin * 0.55);
      const baseMax = Math.floor(oteMax * 0.55);
      const stackPick = [rand(STACKS), rand(STACKS)].filter((v, i, a) => a.indexOf(v) === i);
      await sql`
        insert into public.jobs (
          company_id, title, segment, ote_min, ote_max, base_min, base_max,
          deal_size_avg, sales_cycle_days, methodology, stack, stage, location, is_remote, posted_at
        ) values (
          ${companyIds.get(c.slug)!}::uuid,
          ${`${segment === "SMB" ? "AE" : segment === "Enterprise" || segment === "StrategicEnterprise" ? "Enterprise AE" : "Mid-Market AE"} — ${c.name}`},
          ${segment}, ${oteMin}, ${oteMax}, ${baseMin}, ${baseMax},
          ${segment === "SMB" ? randInt(10_000, 40_000) : segment === "MidMarket" ? randInt(50_000, 120_000) : randInt(150_000, 500_000)},
          ${segment === "SMB" ? randInt(14, 45) : segment === "MidMarket" ? randInt(45, 90) : randInt(90, 180)},
          ${rand(METHODOLOGIES)}, ${stackPick}, ${c.stage}, ${c.hq},
          ${c.hq === "Remote" || Math.random() > 0.5},
          ${new Date(Date.now() - randInt(0, 60) * 86400_000).toISOString()}
        )
      `;
      jobCount++;
    }
  }
  console.log(`  seeded ${jobCount} jobs`);

  // ----- test recruiter (recruiter1@stripe.test) -----
  const recruiterId = await ensureUser("recruiter1@stripe.test", "testing123!", "Jordan Recruiter", "company_member");
  await sql`
    insert into public.company_members (user_id, company_id, role)
    values (${recruiterId}::uuid, ${companyIds.get("stripe")!}::uuid, 'recruiter')
    on conflict (user_id, company_id) do nothing
  `;
  await sql`
    insert into public.subscriptions (company_id, stripe_subscription_id, tier, unlocks_per_month, unlocks_used_current_period)
    values (${companyIds.get("stripe")!}::uuid, 'mock_sub_stripe_growth', 'growth', 25, 3)
    on conflict (company_id) do update set tier = excluded.tier, unlocks_per_month = excluded.unlocks_per_month
  `;
  console.log(`  test recruiter: recruiter1@stripe.test (user_id=${recruiterId})`);

  // ----- test candidate (candidate1@accountexecutive.test) -----
  const candidateId = await ensureUser("candidate1@accountexecutive.test", "testing123!", "Alex Candidate", "candidate");
  await sql`
    insert into public.candidates (user_id, headline, linkedin_url, segment_focus, methodology, current_company_id)
    values (
      ${candidateId}::uuid,
      ${"Enterprise AE — 7yrs closing $100K+ ACV in fintech and devtools"},
      ${"https://linkedin.com/in/alex-candidate"},
      'Enterprise',
      ARRAY['MEDDPICC','ChallengerSale']::text[],
      ${companyIds.get("stripe")!}::uuid
    )
    on conflict (user_id) do update set headline = excluded.headline, segment_focus = excluded.segment_focus
  `;
  await sql`
    insert into public.intent_signals (candidate_id, target_stages, target_segments, comp_ote_min, target_geos, target_companies)
    values (
      ${candidateId}::uuid,
      ARRAY['SeriesB','SeriesC','SeriesD']::text[],
      ARRAY['Enterprise','StrategicEnterprise']::text[],
      280000,
      ARRAY['San Francisco, CA','Remote']::text[],
      ARRAY[]::uuid[]
    )
    on conflict (candidate_id) do update set updated_at = now()
  `;
  // realistic work history for the test candidate
  const stripeId = companyIds.get("stripe")!;
  const plaidId = companyIds.get("plaid")!;
  const datadogId = companyIds.get("datadog")!;
  await sql`
    insert into public.ae_work_history (candidate_id, company_id, title, segment, start_date, end_date, is_current)
    values
      (${candidateId}::uuid, ${stripeId}::uuid, 'Senior Enterprise AE', 'Enterprise', '2023-03-01', null, true),
      (${candidateId}::uuid, ${plaidId}::uuid, 'Enterprise AE', 'Enterprise', '2020-08-01', '2023-02-15', false),
      (${candidateId}::uuid, ${datadogId}::uuid, 'Mid-Market AE', 'MidMarket', '2018-05-01', '2020-07-15', false)
  `;
  // a verified credential
  await sql`
    insert into public.verified_credentials (candidate_id, kind, period_start, period_end, value_json, source, verification_tier)
    values (
      ${candidateId}::uuid, 'quota_attainment', '2024-01-01', '2024-12-31',
      ${JSON.stringify({ percent: 127, quota_usd: 1_400_000, attained_usd: 1_778_000 })}::jsonb,
      'csv:2024-q4-attainment.csv', 'csv_upload'
    )
  `;
  console.log(`  test candidate: candidate1@accountexecutive.test (user_id=${candidateId})`);

  // ----- 100 anonymous candidates with realistic work history -----
  let candidateCount = 0;
  for (let i = 0; i < 100; i++) {
    const firstName = rand(FIRST_NAMES);
    const lastName = rand(LAST_NAMES);
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${i}@candidates.test`;
    // Create auth user
    const created = await admin.auth.admin.createUser({
      email,
      password: "testing123!",
      email_confirm: true,
      user_metadata: { name: `${firstName} ${lastName}` },
    });
    if (created.error) {
      // skip duplicates silently
      continue;
    }
    const userId = created.data.user.id;
    const segment = rand(SEGMENTS);
    const methodologyCount = randInt(1, 3);
    const methodologyPick = Array.from(new Set([...Array(methodologyCount)].map(() => rand(METHODOLOGIES))));

    // pick a "current" company from companies 0..N
    const companyList = Array.from(companyIds.entries());
    const currentCompanyIdx = randInt(0, companyList.length - 1);
    const currentCompany = companyList[currentCompanyIdx]!;
    const currentCompanyId = currentCompany[1];

    await sql`
      insert into public.profiles (user_id, kind, email, name)
      values (${userId}::uuid, 'candidate', ${email}, ${`${firstName} ${lastName}`})
      on conflict (user_id) do nothing
    `;
    await sql`
      insert into public.candidates (user_id, headline, linkedin_url, segment_focus, methodology, current_company_id)
      values (
        ${userId}::uuid,
        ${`${segment === "SMB" ? "AE" : segment === "Enterprise" || segment === "StrategicEnterprise" ? "Enterprise AE" : "Mid-Market AE"} — ${randInt(2, 12)}yrs closing in ${segment}`},
        ${`https://linkedin.com/in/${firstName.toLowerCase()}-${lastName.toLowerCase()}`},
        ${segment}, ${methodologyPick}, ${currentCompanyId}::uuid
      )
      on conflict (user_id) do nothing
    `;
    await sql`
      insert into public.intent_signals (candidate_id, target_stages, target_segments, comp_ote_min)
      values (
        ${userId}::uuid,
        ARRAY['SeriesB','SeriesC','SeriesD']::text[],
        ARRAY[${segment}]::text[],
        ${randInt(180_000, 380_000)}
      )
      on conflict (candidate_id) do nothing
    `;

    // 2-4 work history entries, ending at the "current" company
    const historyCount = randInt(2, 4);
    const usedIndices = new Set<number>();
    const histEntries: { companyIdx: number; isCurrent: boolean }[] = [{ companyIdx: currentCompanyIdx, isCurrent: true }];
    usedIndices.add(currentCompanyIdx);
    for (let h = 1; h < historyCount; h++) {
      let pick = randInt(0, companyList.length - 1);
      let attempts = 0;
      while (usedIndices.has(pick) && attempts < 20) {
        pick = randInt(0, companyList.length - 1);
        attempts++;
      }
      usedIndices.add(pick);
      histEntries.push({ companyIdx: pick, isCurrent: false });
    }
    // assign dates working backwards from now
    let endCursor = new Date();
    for (const entry of histEntries) {
      const tenureMonths = randInt(12, 42);
      const start = new Date(endCursor);
      start.setMonth(start.getMonth() - tenureMonths);
      const end = entry.isCurrent ? null : new Date(endCursor);
      const companyId = companyList[entry.companyIdx]![1];
      await sql`
        insert into public.ae_work_history (candidate_id, company_id, title, segment, start_date, end_date, is_current)
        values (
          ${userId}::uuid, ${companyId}::uuid,
          ${`${segment === "SMB" ? "AE" : segment === "Enterprise" ? "Enterprise AE" : "Mid-Market AE"}`},
          ${segment},
          ${start.toISOString().slice(0, 10)},
          ${end ? end.toISOString().slice(0, 10) : null},
          ${entry.isCurrent}
        )
      `;
      endCursor = start;
    }
    candidateCount++;
  }
  console.log(`  seeded ${candidateCount} anonymous candidates`);

  // ----- pending unlock request from Stripe (recruiter1) for the test candidate -----
  await sql`
    insert into public.unlock_requests (company_id, candidate_id, status, message, mock_stripe_charge_id)
    values (
      ${companyIds.get("stripe")!}::uuid,
      ${candidateId}::uuid,
      'pending',
      'Saw your background closing fintech enterprise — we have an Enterprise AE role open in NY.',
      ${`mock_ch_${Date.now()}`}
    )
  `;
  // notification on candidate's bell
  await sql`
    insert into public.notifications (user_id, kind, payload_json)
    values (
      ${candidateId}::uuid,
      'unlock_requested',
      ${JSON.stringify({ company_slug: "stripe", company_name: "Stripe" })}::jsonb
    )
  `;
  console.log(`  seeded pending unlock request: Stripe -> candidate1`);

  // mock ATS connection for Stripe
  await sql`
    insert into public.ats_connections (company_id, vendor, encrypted_credentials, last_synced_at)
    values (${companyIds.get("stripe")!}::uuid, 'greenhouse', 'mock_encrypted', now() - interval '2 hours')
    on conflict (company_id, vendor) do nothing
  `;

  // ----- summary -----
  const [{ companies, jobs, candidates, profiles, unlocks }] = await sql<
    { companies: number; jobs: number; candidates: number; profiles: number; unlocks: number }[]
  >`
    select
      (select count(*)::int from public.companies) as companies,
      (select count(*)::int from public.jobs) as jobs,
      (select count(*)::int from public.candidates) as candidates,
      (select count(*)::int from public.profiles) as profiles,
      (select count(*)::int from public.unlock_requests) as unlocks
  `;
  console.log(`ae-hq seed complete: companies=${companies} jobs=${jobs} candidates=${candidates} profiles=${profiles} unlocks=${unlocks}`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
