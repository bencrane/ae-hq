#!/usr/bin/env tsx
/**
 * check-cycle-3-schema.ts
 *
 * Criterion 4 verifier for /scope cycle `ae-hq-messaging-feed-pipeline`.
 *
 * Connects to the Supabase Postgres instance via `AE_DB_DIRECT_URL` and
 * asserts the cycle-3 migration landed correctly:
 *
 *   1. All 6 new tables exist in the `public` schema:
 *        conversations, messages, articles,
 *        pipeline_stages, pipeline_candidates, pipeline_activity
 *   2. Every one of those 6 tables has Row Level Security ENABLED
 *      (`pg_class.relrowsecurity = true`). The directive's "deny-all"
 *      requirement is satisfied either by RLS-enabled-with-no-policies
 *      (the cycle-1 convention) OR by explicit `USING (false)` policies —
 *      so this check asserts RLS is ON and does NOT count policies.
 *   3. The required FK relationships exist (the new tables FK into the
 *      cycle-1 tables — a broken FK target is a hard fail):
 *        conversations.candidate_id   -> candidates.user_id
 *        conversations.company_id     -> companies.id
 *        messages.conversation_id     -> conversations.id
 *        pipeline_stages.company_id   -> companies.id
 *        pipeline_candidates.stage_id -> pipeline_stages.id
 *        pipeline_activity.pipeline_candidate_id -> pipeline_candidates.id
 *   4. The two UNIQUE constraints the directive specifies exist:
 *        conversations  UNIQUE(candidate_id, company_id)
 *        pipeline_candidates UNIQUE(company_id, candidate_id)
 *   5. The directive-specified index on messages(conversation_id, created_at)
 *      exists (thread pagination).
 *
 * Exit codes:
 *   0 — schema is sound
 *   1 — at least one assertion failed
 *   2 — AE_DB_DIRECT_URL not set / cannot connect
 */

import postgres from "postgres";

const DB_URL = process.env.AE_DB_DIRECT_URL;
if (!DB_URL) {
  console.error("FAIL: AE_DB_DIRECT_URL not set (source .env.local)");
  process.exit(2);
}

const NEW_TABLES = [
  "conversations",
  "messages",
  "articles",
  "pipeline_stages",
  "pipeline_candidates",
  "pipeline_activity",
] as const;

// [child table, child column, parent table, parent column]
const REQUIRED_FKS: Array<[string, string, string, string]> = [
  ["conversations", "candidate_id", "candidates", "user_id"],
  ["conversations", "company_id", "companies", "id"],
  ["messages", "conversation_id", "conversations", "id"],
  ["pipeline_stages", "company_id", "companies", "id"],
  ["pipeline_candidates", "stage_id", "pipeline_stages", "id"],
  ["pipeline_activity", "pipeline_candidate_id", "pipeline_candidates", "id"],
];

// [table, [columns that form the UNIQUE constraint]]
const REQUIRED_UNIQUES: Array<[string, string[]]> = [
  ["conversations", ["candidate_id", "company_id"]],
  ["pipeline_candidates", ["company_id", "candidate_id"]],
];

async function main() {
  const sql = postgres(DB_URL!, { ssl: "prefer", max: 1 });
  const failures: string[] = [];
  try {
    // ---- 1. tables exist ----
    // `sql([...])` expands a JS array into a SQL `IN (...)` list — the
    // postgres lib's documented array-parameter form.
    const tableNames = NEW_TABLES as unknown as string[];
    const tableRows = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name in ${sql(tableNames)}
    `;
    const present = new Set(tableRows.map((r) => r.table_name));
    for (const t of NEW_TABLES) {
      if (!present.has(t)) failures.push(`table public.${t} does not exist`);
    }

    // ---- 2. RLS enabled on every new table ----
    const rlsRows = await sql<{ relname: string; relrowsecurity: boolean }[]>`
      select c.relname, c.relrowsecurity
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in ${sql(tableNames)}
    `;
    const rlsByName = new Map(rlsRows.map((r) => [r.relname, r.relrowsecurity]));
    for (const t of NEW_TABLES) {
      if (!present.has(t)) continue; // already reported
      if (rlsByName.get(t) !== true) failures.push(`RLS not enabled on public.${t}`);
    }

    // ---- 3. FK relationships ----
    const fkRows = await sql<
      { child: string; child_col: string; parent: string; parent_col: string }[]
    >`
      select
        tc.table_name        as child,
        kcu.column_name      as child_col,
        ccu.table_name       as parent,
        ccu.column_name      as parent_col
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
      join information_schema.constraint_column_usage ccu
        on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
      where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
    `;
    const fkSet = new Set(fkRows.map((r) => `${r.child}.${r.child_col}->${r.parent}.${r.parent_col}`));
    for (const [ct, cc, pt, pc] of REQUIRED_FKS) {
      const key = `${ct}.${cc}->${pt}.${pc}`;
      if (!fkSet.has(key)) failures.push(`missing FK: ${key}`);
    }

    // ---- 4. UNIQUE constraints ----
    const uniqRows = await sql<{ table_name: string; constraint_name: string; column_name: string }[]>`
      select tc.table_name, tc.constraint_name, kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
      where tc.constraint_type = 'UNIQUE' and tc.table_schema = 'public'
    `;
    // group columns by constraint
    const byConstraint = new Map<string, { table: string; cols: Set<string> }>();
    for (const r of uniqRows) {
      const e = byConstraint.get(r.constraint_name) ?? { table: r.table_name, cols: new Set<string>() };
      e.cols.add(r.column_name);
      byConstraint.set(r.constraint_name, e);
    }
    for (const [table, cols] of REQUIRED_UNIQUES) {
      const want = new Set(cols);
      const found = [...byConstraint.values()].some(
        (e) => e.table === table && e.cols.size === want.size && [...want].every((c) => e.cols.has(c)),
      );
      if (!found) failures.push(`missing UNIQUE(${cols.join(", ")}) on public.${table}`);
    }

    // ---- 5. messages(conversation_id, created_at) index ----
    const idxRows = await sql<{ indexdef: string }[]>`
      select indexdef from pg_indexes where schemaname = 'public' and tablename = 'messages'
    `;
    const hasThreadIdx = idxRows.some((r) => {
      const d = r.indexdef.toLowerCase();
      return d.includes("conversation_id") && d.includes("created_at");
    });
    if (present.has("messages") && !hasThreadIdx) {
      failures.push("missing index on messages(conversation_id, created_at)");
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  if (failures.length === 0) {
    console.log(`OK: 6 cycle-3 tables exist, RLS enabled, FKs + uniques + thread index present`);
    process.exit(0);
  }
  console.error(`FAIL: ${failures.length} schema problem(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(`FAIL: schema check threw: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
});
