#!/usr/bin/env tsx
/**
 * check-cycle-4-schema.ts
 *
 * Criterion 4 verifier for /scope cycle `ae-hq-polish-and-profiles`.
 *
 * Connects to the Supabase Postgres instance via `AE_DB_DIRECT_URL` and
 * asserts the cycle-4 migration (`0003_*.sql`) landed correctly:
 *
 *   1. `public.companies` has all 4 NEW columns with the right types:
 *        sales_motion   text
 *        founded_year   integer
 *        investors      text[]  (ARRAY of text)
 *        employee_count integer
 *   2. The pre-existing `companies.stage` column is STILL present
 *      (the directive says "keep" it — a destructive migration that
 *      renamed or dropped it is a hard fail).
 *   3. `companies` still has RLS enabled (the additive migration must not
 *      have disabled it — cycle-1/2/3 deny-all convention).
 *   4. If a CHECK constraint or enum guards `sales_motion`, every non-null
 *      value is one of the 4 allowed motions (plg, sales_led, enterprise,
 *      hybrid). This is asserted against the DATA, not the constraint, so
 *      it holds whether the directive's "enum" is a real PG enum, a text
 *      column + CHECK, or a bare text column.
 *   5. SEED COMPLETENESS — all 20 seeded companies have NON-NULL
 *      firmographic data:
 *        - sales_motion non-null   (and a valid motion)
 *        - founded_year non-null   (and plausible: 1900..currentYear)
 *        - employee_count non-null (and > 0)
 *        - investors non-null and a NON-EMPTY array
 *      The directive requires "all 20 companies have non-null firmographic
 *      data"; an empty `investors` array is treated as a fail because the
 *      investor dimension must be testable (cycle 6 uses it).
 *
 * This script does NOT run the migration or the seed — the cycle-4
 * verifier runs `bun run seed` before invoking this. It is a pure
 * post-state assertion.
 *
 * Exit codes:
 *   0 — schema + seed sound
 *   1 — at least one assertion failed
 *   2 — AE_DB_DIRECT_URL not set / cannot connect
 */

import postgres from "postgres";

const DB_URL = process.env.AE_DB_DIRECT_URL;
if (!DB_URL) {
  console.error("FAIL: AE_DB_DIRECT_URL not set (source .env.local)");
  process.exit(2);
}

const VALID_MOTIONS = ["plg", "sales_led", "enterprise", "hybrid"] as const;
const CURRENT_YEAR = new Date().getFullYear();

// [column, expected data_type substring]. Postgres reports text[] as "ARRAY".
const NEW_COLUMNS: ReadonlyArray<[string, string]> = [
  ["sales_motion", "text"],
  ["founded_year", "integer"],
  ["investors", "ARRAY"],
  ["employee_count", "integer"],
];

const sql = postgres(DB_URL, { ssl: "prefer", max: 1 });

let failed = false;
function fail(msg: string) {
  console.error(`  FAIL  ${msg}`);
  failed = true;
}
function ok(msg: string) {
  console.log(`  ok    ${msg}`);
}

async function main() {
  // ── 1 + 2. column presence + types ────────────────────────────────────────
  const cols = await sql<{ column_name: string; data_type: string }[]>`
    select column_name, data_type
    from information_schema.columns
    where table_schema = 'public' and table_name = 'companies'
  `;
  const colMap = new Map(cols.map((r) => [r.column_name, r.data_type]));

  for (const [name, expected] of NEW_COLUMNS) {
    const dt = colMap.get(name);
    if (!dt) {
      fail(`companies.${name} — column missing (migration 0003 not applied?)`);
    } else if (!dt.toLowerCase().includes(expected.toLowerCase())) {
      fail(`companies.${name} — type is "${dt}", expected to contain "${expected}"`);
    } else {
      ok(`companies.${name} (${dt})`);
    }
  }

  if (!colMap.has("stage")) {
    fail(`companies.stage — pre-existing column is GONE (0003 must be additive, keep stage)`);
  } else {
    ok(`companies.stage preserved (${colMap.get("stage")})`);
  }

  // ── 3. RLS still enabled on companies ──────────────────────────────────────
  const rls = await sql<{ relrowsecurity: boolean }[]>`
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'companies'
  `;
  if (rls[0]?.relrowsecurity === true) {
    ok(`companies RLS enabled`);
  } else {
    fail(`companies RLS is NOT enabled — additive migration disabled it`);
  }

  // Short-circuit: if columns are missing, seed checks are meaningless.
  if (failed) {
    await sql.end({ timeout: 5 });
    console.error("\nFAIL: cycle-4 companies schema is not sound — skipping seed checks");
    process.exit(1);
  }

  // ── 4 + 5. seed completeness across all 20 companies ───────────────────────
  const companies = await sql<
    {
      slug: string;
      sales_motion: string | null;
      founded_year: number | null;
      employee_count: number | null;
      investors: string[] | null;
    }[]
  >`
    select slug, sales_motion, founded_year, employee_count, investors
    from public.companies
    order by slug
  `;

  if (companies.length < 20) {
    fail(`expected >= 20 seeded companies, found ${companies.length}`);
  } else {
    ok(`${companies.length} companies present`);
  }

  let badMotion = 0;
  let nullMotion = 0;
  let badYear = 0;
  let badCount = 0;
  let emptyInvestors = 0;
  const offenders: string[] = [];

  for (const co of companies) {
    const problems: string[] = [];

    if (co.sales_motion == null) {
      nullMotion++;
      problems.push("sales_motion=NULL");
    } else if (!VALID_MOTIONS.includes(co.sales_motion as (typeof VALID_MOTIONS)[number])) {
      badMotion++;
      problems.push(`sales_motion="${co.sales_motion}" (not one of ${VALID_MOTIONS.join("|")})`);
    }

    if (co.founded_year == null || co.founded_year < 1900 || co.founded_year > CURRENT_YEAR) {
      badYear++;
      problems.push(`founded_year=${co.founded_year ?? "NULL"} (need 1900..${CURRENT_YEAR})`);
    }

    if (co.employee_count == null || co.employee_count <= 0) {
      badCount++;
      problems.push(`employee_count=${co.employee_count ?? "NULL"} (need > 0)`);
    }

    if (co.investors == null || !Array.isArray(co.investors) || co.investors.length === 0) {
      emptyInvestors++;
      problems.push(`investors=${JSON.stringify(co.investors)} (need a non-empty array)`);
    }

    if (problems.length > 0) offenders.push(`${co.slug}: ${problems.join(", ")}`);
  }

  if (offenders.length === 0) {
    ok(`all ${companies.length} companies have complete firmographic data`);
  } else {
    fail(
      `${offenders.length} compan${offenders.length === 1 ? "y" : "ies"} with incomplete firmographic data ` +
        `(nullMotion=${nullMotion} badMotion=${badMotion} badYear=${badYear} ` +
        `badCount=${badCount} emptyInvestors=${emptyInvestors})`,
    );
    for (const o of offenders.slice(0, 12)) console.error(`        - ${o}`);
    if (offenders.length > 12) console.error(`        … and ${offenders.length - 12} more`);
  }

  await sql.end({ timeout: 5 });

  if (failed) {
    console.error("\nFAIL: cycle-4 schema/seed check did not pass");
    process.exit(1);
  }
  console.log(
    `OK: companies has all 4 firmographic columns; all ${companies.length} companies fully seeded`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(`FAIL: cycle-4 schema check threw: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
});
