#!/usr/bin/env bash
# cycle-5-criteria.sh
#
# Harness verification for /scope cycle `ae-hq-jobs-as-objects` (cycle 5).
# Exit 0 ⇔ all 16 success criteria from the cycle-5 directive pass.
#
# Usage:
#   scripts/benchmarks/cycle-5-criteria.sh [--skip-storybook] [--skip-e2e]
#
# Environment:
#   This script sources `.env.local` at the repo root itself — the project
#   has NO direnv/.envrc; the scripted checks need AE_DB_DIRECT_URL /
#   AE_SUPABASE_URL / the anon key. If a var is already exported it is kept.
#
#   TEST_CANDIDATE_EMAIL  (default candidate1@accountexecutive.test)
#   TEST_RECRUITER_EMAIL  (default recruiter1@stripe.test)
#   TEST_PASSWORD         (default testing123!)
#
# Migration note:
#   This verifier does NOT itself run `psql 0004_*.sql`. Migrations 0001-0003
#   are already applied to the shared Supabase instance; criterion 4 asserts
#   the POST-STATE (the `applications` table + the `pipeline_activity` columns
#   exist). The executor applies 0004 as part of its work. Re-running
#   0001-0003 is FORBIDDEN by the directive — and unnecessary, since this
#   script only reads the resulting schema. If `applications` is absent,
#   criterion 4 fails loudly and the executor knows 0004 has not landed.
#
# Exit codes:
#   0  — all 16 success criteria pass
#   1  — one or more criteria failed
#   99 — missing required CLI tool / cannot locate repo root

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="$REPO_ROOT/apps/platform-app"
API_DIR="$REPO_ROOT/apps/platform-api"
UI_DIR="$REPO_ROOT/packages/ui"
BENCH="$REPO_ROOT/scripts/benchmarks"

APP_URL="${APP_URL:-http://localhost:5173}"
API_URL="${API_URL:-http://localhost:8080}"
STORYBOOK_URL="${STORYBOOK_URL:-http://localhost:6006}"
TEST_CANDIDATE_EMAIL="${TEST_CANDIDATE_EMAIL:-candidate1@accountexecutive.test}"
TEST_RECRUITER_EMAIL="${TEST_RECRUITER_EMAIL:-recruiter1@stripe.test}"
TEST_PASSWORD="${TEST_PASSWORD:-testing123!}"

SKIP_STORYBOOK=0
SKIP_E2E=0
for arg in "$@"; do
  case "$arg" in
    --skip-storybook) SKIP_STORYBOOK=1 ;;
    --skip-e2e)       SKIP_E2E=1 ;;
  esac
done

# ── source .env.local (no direnv in this project) ───────────────────────────
if [ -f "$REPO_ROOT/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$REPO_ROOT/.env.local"
  set +a
fi
# The scripted checks accept AE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY;
# bridge the project's VITE_ name to the AE_ name the checks also read.
export AE_SUPABASE_ANON_KEY="${AE_SUPABASE_ANON_KEY:-${VITE_SUPABASE_PUBLISHABLE_KEY:-}}"
export APP_URL API_URL STORYBOOK_URL TEST_CANDIDATE_EMAIL TEST_RECRUITER_EMAIL TEST_PASSWORD

PASS_CT=0
FAIL_CT=0
FAILURES=()

bold() { printf "\033[1m%s\033[0m\n" "$*"; }
red()  { printf "\033[31m%s\033[0m\n" "$*"; }
green(){ printf "\033[32m%s\033[0m\n" "$*"; }
gray() { printf "\033[90m%s\033[0m\n" "$*"; }
step() { bold ""; bold "── $1"; }
pass() { green "  PASS  $1"; PASS_CT=$((PASS_CT + 1)); }
fail() { red   "  FAIL  $1"; FAIL_CT=$((FAIL_CT + 1)); FAILURES+=("$1"); }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { red "missing required command: $1"; exit 99; }
}
http_status() { curl -sS -o /dev/null -w "%{http_code}" -m 10 "$1"; }

require_cmd bun
require_cmd node
require_cmd npx
require_cmd curl
require_cmd jq
require_cmd psql

cd "$REPO_ROOT" || { red "cannot cd to repo root $REPO_ROOT"; exit 99; }

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 1 — bun install + bun run build across all workspaces
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 1 — bun install + bun run build (all workspaces)"
if bun install --silent > /tmp/ae-hq-c5-install.log 2>&1; then
  if bun run build > /tmp/ae-hq-c5-build.log 2>&1; then
    if [ -d "$APP_DIR/dist" ] \
       && { [ -f "$API_DIR/dist/index.js" ] || [ -f "$API_DIR/dist/server.js" ]; }; then
      pass "bun install + build clean; app/api artifacts present"
    else
      fail "build ran but app/api artifacts missing — see /tmp/ae-hq-c5-build.log"
    fi
  else
    fail "bun run build failed — see /tmp/ae-hq-c5-build.log"
  fi
else
  fail "bun install failed — see /tmp/ae-hq-c5-install.log"
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 2 — typecheck: 0 errors, no `any`
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 2 — bun run typecheck (0 errors) + no-any sweep"
if bun run typecheck > /tmp/ae-hq-c5-typecheck.log 2>&1; then
  ANY_HITS="$(grep -rnE ':\s*any\b|\bas any\b' \
      "$API_DIR/src" "$APP_DIR/src" "$UI_DIR/src" \
      --include='*.ts' --include='*.tsx' 2>/dev/null \
      | grep -vE '//.*any|eslint|@ts-' | wc -l | tr -d ' ')"
  if [ "$ANY_HITS" = "0" ]; then
    pass "typecheck clean; no \`any\` in api/app/ui source"
  else
    fail "$ANY_HITS \`any\` occurrence(s) in source — see grep ':\\s*any'"
  fi
else
  fail "typecheck failed — see /tmp/ae-hq-c5-typecheck.log"
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 3 — lint clean; no-route-geometry still enforced
#   (a) baseline lint passes
#   (b) a planted top-level-geometry violation makes the lint FAIL — proves
#       the no-route-geometry rule is still wired and live.
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 3 — bun run lint + no-route-geometry rule live"
if bun run lint > /tmp/ae-hq-c5-lint.log 2>&1; then
  PROBE="$APP_DIR/src/routes/__c5_lint_probe__.tsx"
  cat > "$PROBE" <<'EOF'
export function __C5LintProbe__() {
  return <div className="mx-auto max-w-3xl px-6 py-12">probe</div>;
}
EOF
  rule_triggered=0
  if bun run lint > /tmp/ae-hq-c5-lint-probe.log 2>&1; then
    rule_triggered=0
  else
    grep -qE "no-route-geometry|route-geometry" /tmp/ae-hq-c5-lint-probe.log && rule_triggered=1
  fi
  rm -f "$PROBE"
  if [ "$rule_triggered" = "1" ]; then
    pass "lint clean; no-route-geometry blocks banned classes"
  else
    fail "no-route-geometry did NOT fire on planted violation — see /tmp/ae-hq-c5-lint-probe.log"
  fi
else
  fail "baseline lint failed — see /tmp/ae-hq-c5-lint.log"
fi

# ── route-geometry AST regression (cycle-2 artifact, still applies) ─────────
step "Criterion 3b — routes still free of banned top-level geometry (AST)"
if bun x tsx "$BENCH/check-no-route-geometry.ts" > /tmp/ae-hq-c5-ast.log 2>&1; then
  pass "AST clean — no route has banned top-level geometry"
else
  fail "banned route geometry detected — see /tmp/ae-hq-c5-ast.log"
  tail -8 /tmp/ae-hq-c5-ast.log | sed 's/^/    /'
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 5 — run the cycle-5 seed (idempotently), THEN criteria 4 + 5
#   assert the post-state. The seed is run twice: a second run must not
#   change the applications row count (idempotency — directive: "idempotent
#   re-run safe"; the only natural key is UNIQUE(job_id,candidate_id)).
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 5 — run cycle-5 seed twice (idempotency), then assert"
seed_ok=0
if bun run seed > /tmp/ae-hq-c5-seed1.log 2>&1; then
  APP_COUNT_SQL="select count(*) from public.applications"
  AC1="$(psql "$AE_DB_DIRECT_URL" -tAc "$APP_COUNT_SQL" 2>/dev/null | tr -d ' ')"
  if bun run seed > /tmp/ae-hq-c5-seed2.log 2>&1; then
    AC2="$(psql "$AE_DB_DIRECT_URL" -tAc "$APP_COUNT_SQL" 2>/dev/null | tr -d ' ')"
    if [ -z "${AC1:-}" ] || [ -z "${AC2:-}" ]; then
      fail "could not read applications count — does the table exist? (migration 0004)"
    elif [ "$AC1" != "$AC2" ]; then
      fail "seed NOT idempotent — applications count changed on re-run ($AC1 -> $AC2)"
    else
      seed_ok=1
      gray "  seed idempotent (applications count stable at $AC1)"
    fi
  else
    fail "second seed run failed — see /tmp/ae-hq-c5-seed2.log"
  fi
else
  fail "seed failed — see /tmp/ae-hq-c5-seed1.log"
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 4 + 5 — schema (applications + pipeline_activity) + seed contents
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 4 + 5 — cycle-5 schema + seed assertion"
if bun x tsx "$BENCH/check-cycle-5-schema.ts" > /tmp/ae-hq-c5-schema.log 2>&1; then
  pass "$(tail -1 /tmp/ae-hq-c5-schema.log)"
else
  fail "cycle-5 schema/seed check failed — see /tmp/ae-hq-c5-schema.log"
  tail -14 /tmp/ae-hq-c5-schema.log | sed 's/^/    /'
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 6 — storybook:build; new primitives have stories; test:a11y clean
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 6 — storybook build + per-primitive stories + axe a11y"
if [ "$SKIP_STORYBOOK" = "1" ]; then
  gray "  SKIPPED (--skip-storybook)"
else
  sb_ok=1
  if bun run storybook:build > /tmp/ae-hq-c5-sb-build.log 2>&1; then
    if bun x tsx "$BENCH/check-primitive-stories.ts" > /tmp/ae-hq-c5-stories.log 2>&1; then
      :
    else
      sb_ok=0
      fail "primitive story coverage failed — see /tmp/ae-hq-c5-stories.log"
      tail -8 /tmp/ae-hq-c5-stories.log | sed 's/^/    /'
    fi
  else
    sb_ok=0
    fail "storybook:build failed — see /tmp/ae-hq-c5-sb-build.log"
  fi
  if [ "$sb_ok" = "1" ]; then
    if bun run test:a11y > /tmp/ae-hq-c5-a11y.log 2>&1; then
      pass "storybook builds; every primitive has a story; axe-core 0 violations"
    else
      fail "axe-core found violations — see /tmp/ae-hq-c5-a11y.log"
    fi
  fi
fi

# ════════════════════════════════════════════════════════════════════════════
# Boot dev for the runtime criteria (8, 11, 12, 13, 14, 15, 16). The e2e
# suite (criterion 7) boots its own server via playwright webServer with
# reuseExistingServer:true — it reuses this one.
# ════════════════════════════════════════════════════════════════════════════
step "Booting dev server for runtime criteria"
DEV_LOG=/tmp/ae-hq-c5-dev.log
( bun run dev > "$DEV_LOG" 2>&1 & echo $! > /tmp/ae-hq-c5-dev.pid )
DEV_PID="$(cat /tmp/ae-hq-c5-dev.pid)"
cleanup_dev() {
  if [ -n "${DEV_PID:-}" ] && kill -0 "$DEV_PID" 2>/dev/null; then
    pkill -P "$DEV_PID" 2>/dev/null || true
    kill "$DEV_PID" 2>/dev/null || true
    sleep 1
    kill -9 "$DEV_PID" 2>/dev/null || true
  fi
}
trap cleanup_dev EXIT

dev_up=0
for _ in $(seq 1 45); do
  app_code="$(http_status "$APP_URL/" 2>/dev/null || echo 000)"
  api_code="$(http_status "$API_URL/healthz" 2>/dev/null || echo 000)"
  if [ "$app_code" = "200" ] && [ "$api_code" = "200" ]; then dev_up=1; break; fi
  sleep 1
done

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 8 — bun run dev boots clean
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 8 — bun run dev boots clean"
if [ "$dev_up" = "1" ]; then
  pass "dev booted (app + api healthy)"
else
  fail "dev failed to boot (app=$app_code api=$api_code) — see $DEV_LOG"
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 7 — unit tests + the full e2e suite
#   The e2e suite includes cycle-5.spec.ts (criteria 11/13/14-guard/16) plus
#   cycle-1..4 specs (regression). Criterion 7 = unit + e2e both green.
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 7 — bun run test (unit) + bun run test:e2e (incl. cycle-5 spec)"
if bun run test > /tmp/ae-hq-c5-test.log 2>&1; then
  unit_ok=1
else
  unit_ok=0
fi
e2e_ok=0
if [ "$SKIP_E2E" = "1" ]; then
  [ "$unit_ok" = "1" ] \
    && pass "unit tests green (e2e skipped — criteria 11/13/16 e2e NOT verified)" \
    || fail "unit tests failed — see /tmp/ae-hq-c5-test.log"
else
  if [ "$unit_ok" = "1" ]; then
    if bun run test:e2e > /tmp/ae-hq-c5-e2e.log 2>&1; then
      e2e_ok=1
      pass "unit + e2e green (cycle-5 spec covers apply / per-job drag / flicker)"
    else
      fail "e2e suite failed — see /tmp/ae-hq-c5-e2e.log"
      tail -25 /tmp/ae-hq-c5-e2e.log | sed 's/^/    /'
    fi
  else
    fail "unit tests failed — see /tmp/ae-hq-c5-test.log"
    tail -12 /tmp/ae-hq-c5-test.log | sed 's/^/    /'
  fi
fi

# ── assert the cycle-5 spec carries its load-bearing tests (anti-deletion) ──
step "Criterion 7b — cycle-5.spec.ts carries the load-bearing tests"
C5_SPEC="$REPO_ROOT/e2e/cycle-5.spec.ts"
if [ ! -f "$C5_SPEC" ]; then
  fail "e2e/cycle-5.spec.ts missing — the apply/drag/flicker tests must live here"
else
  miss=()
  grep -q "job-apply-button"  "$C5_SPEC" || miss+=("apply test")
  grep -q "data-application-id" "$C5_SPEC" || miss+=("per-job drag test")
  grep -q "MIN_COL_PX"        "$C5_SPEC" || miss+=("kanban width guard")
  grep -q "__c5flicker"       "$C5_SPEC" || miss+=("flicker test")
  if [ "${#miss[@]}" -eq 0 ]; then
    pass "cycle-5.spec.ts contains apply + per-job-drag + width-guard + flicker tests"
  else
    fail "cycle-5.spec.ts is missing: ${miss[*]}"
  fi
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 9 + 10 + 15 — /me/jobs in the portal shell; >= 2 collections;
#   company profile with investors, reachable from a job detail.
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 9 + 10 + 15 — portal jobs surface + collections + company profile"
if [ "$dev_up" != "1" ]; then
  fail "skipped — dev not up"
elif bun x tsx "$BENCH/check-portal-surfaces.ts" > /tmp/ae-hq-c5-surfaces.log 2>&1; then
  pass "$(tail -1 /tmp/ae-hq-c5-surfaces.log)"
else
  fail "portal surfaces check failed — see /tmp/ae-hq-c5-surfaces.log"
  tail -16 /tmp/ae-hq-c5-surfaces.log | sed 's/^/    /'
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 11 — apply side effect + idempotency (API + DB).
#   The e2e cycle-5 spec proves the applied-state UI; this proves the API
#   contract: one row created, re-apply is a no-op, row well-formed.
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 11 — apply creates one row; re-apply is a no-op (API + DB)"
if [ "$dev_up" != "1" ]; then
  fail "skipped — dev not up"
elif bun x tsx "$BENCH/check-apply-idempotent.ts" > /tmp/ae-hq-c5-apply.log 2>&1; then
  pass "$(tail -1 /tmp/ae-hq-c5-apply.log)  (applied-state UI asserted by e2e cycle-5 spec)"
else
  fail "apply idempotency check failed — see /tmp/ae-hq-c5-apply.log"
  tail -12 /tmp/ae-hq-c5-apply.log | sed 's/^/    /'
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 12 — /co/jobs lists postings each with applicant count + funnel.
#   Browser check: the company jobs overview renders >= 1 posting row, and
#   each carries an applicant count and a funnel summary.
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 12 — /co/jobs aggregate dashboard (applicant count + funnel)"
if [ "$dev_up" != "1" ]; then
  fail "skipped — dev not up"
elif bun x tsx "$BENCH/check-company-jobs.ts" > /tmp/ae-hq-c5-cojobs.log 2>&1; then
  pass "$(tail -1 /tmp/ae-hq-c5-cojobs.log)"
else
  fail "/co/jobs overview check failed — see /tmp/ae-hq-c5-cojobs.log"
  tail -12 /tmp/ae-hq-c5-cojobs.log | sed 's/^/    /'
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 13 — per-job kanban move persists stage + writes a
#   pipeline_activity row keyed on application_id. (The drag-UI half is
#   asserted by the cycle-5 e2e spec — adjacent-column drag.)
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 13 — per-job application move persists + logs activity (API + DB)"
if [ "$dev_up" != "1" ]; then
  fail "skipped — dev not up"
elif bun x tsx "$BENCH/check-application-move.ts" > /tmp/ae-hq-c5-move.log 2>&1; then
  pass "$(tail -1 /tmp/ae-hq-c5-move.log)  (drag-UI half asserted by e2e cycle-5 spec)"
else
  fail "per-job application move check failed — see /tmp/ae-hq-c5-move.log"
  tail -12 /tmp/ae-hq-c5-move.log | sed 's/^/    /'
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 14 — kanban geometry. THE carried-over cycle-4 failure.
#   check-kanban-width.ts measures the RENDERED width of every column on the
#   live /co/jobs/:id board: every column >= 280px, the board owns its
#   horizontal scroll, no column clipped past the fold, card labels not
#   truncated. A column-count check is INSUFFICIENT — cycle 4 passed that
#   and still shipped 176px columns.
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 14 — kanban columns >= 280px, board scrolls, no clip, no truncation"
if [ "$dev_up" != "1" ]; then
  fail "skipped — dev not up"
elif bun x tsx "$BENCH/check-kanban-width.ts" > /tmp/ae-hq-c5-kanban.log 2>&1; then
  pass "$(tail -1 /tmp/ae-hq-c5-kanban.log)"
else
  fail "kanban geometry check failed — see /tmp/ae-hq-c5-kanban.log"
  tail -16 /tmp/ae-hq-c5-kanban.log | sed 's/^/    /'
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 16 — all routes (cycle 1-4 + new) return 200 (no 500s);
#   PageHeader eyebrow alignment holds; the flicker fix still holds.
#   16a — route sweep; 16b — PageHeader alignment; 16c — flicker e2e present.
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 16a — all routes return 200 (no 500s)"
if [ "$dev_up" != "1" ]; then
  fail "skipped — dev not up"
else
  # cycle-1..4 routes (the cycle-4 verifier's 22) + the cycle-5 additions.
  # /co/jobs/:id and /companies/:slug need a real id/slug — :id is a uuid so
  # we use a known seeded slug for companies and assert /co/jobs/:id via a
  # discovered id below; here the static list covers the fixed routes.
  ROUTES=( "/" "/companies/stripe" "/signin" "/signup" "/404"
           "/me" "/me/profile" "/me/intent" "/me/credentials" "/me/approvals"
           "/me/jobs"
           "/co" "/co/candidates" "/co/candidates/abc" "/co/company" "/co/ats" "/co/billing"
           "/co/pipeline" "/co/jobs"
           "/inbox" "/inbox/seed-conv-1" "/insights" "/insights/seed-article-1" )
  route_fail=0
  for r in "${ROUTES[@]}"; do
    c="$(http_status "$APP_URL$r")"
    [ "$c" = "200" ] || { red "    $r -> $c"; route_fail=1; }
  done
  # /jobs/:id — discover a real job id from the DB (jobs.id is a uuid).
  JOB_ID="$(psql "$AE_DB_DIRECT_URL" -tAc \
    "select id from public.jobs order by posted_at desc nulls last limit 1" 2>/dev/null \
    | tr -d ' ')"
  if [ -n "$JOB_ID" ]; then
    c="$(http_status "$APP_URL/jobs/$JOB_ID")"
    [ "$c" = "200" ] || { red "    /jobs/$JOB_ID -> $c"; route_fail=1; }
    # /co/jobs/:id per-job pipeline route
    c="$(http_status "$APP_URL/co/jobs/$JOB_ID")"
    [ "$c" = "200" ] || { red "    /co/jobs/$JOB_ID -> $c"; route_fail=1; }
  else
    red "    could not discover a job id for /jobs/:id and /co/jobs/:id"
    route_fail=1
  fi
  [ "$route_fail" = "0" ] \
    && pass "all cycle-1..5 routes return 200 (SPA shell; incl. /me/jobs, /co/jobs, /co/jobs/:id)" \
    || fail "one or more routes returned non-200"
fi

step "Criterion 16b — PageHeader eyebrow alignment holds across authed routes"
if [ "$dev_up" != "1" ]; then
  fail "skipped — dev not up"
elif [ -f "$BENCH/check-page-header-alignment.ts" ]; then
  if APP_URL="$APP_URL" \
     TEST_CANDIDATE_EMAIL="$TEST_CANDIDATE_EMAIL" \
     TEST_RECRUITER_EMAIL="$TEST_RECRUITER_EMAIL" \
     TEST_PASSWORD="$TEST_PASSWORD" \
     bun x tsx "$BENCH/check-page-header-alignment.ts" > /tmp/ae-hq-c5-align.log 2>&1; then
    pass "PageHeader eyebrow alignment within tolerance across authed routes"
  else
    fail "PageHeader alignment drifted — see /tmp/ae-hq-c5-align.log"
  fi
else
  fail "check-page-header-alignment.ts absent — cycle-2 artifact expected to exist"
fi

# ─ Criterion 16c — the flicker e2e test must EXIST in cycle-5.spec.ts and the
#   e2e run must not have failed it. The directive says the cycle-4 flicker
#   fix must still hold; the cycle-5 spec re-asserts it on the /me/jobs nav.
step "Criterion 16c — flicker fix still holds (sidebar persists across navigation)"
if [ ! -f "$C5_SPEC" ]; then
  fail "e2e/cycle-5.spec.ts missing — the flicker re-assertion lives here"
elif ! grep -q "__c5flicker" "$C5_SPEC" || ! grep -q "same DOM node" "$C5_SPEC"; then
  fail "cycle-5.spec.ts does not contain the sidebar-persistence (flicker) test"
elif [ "$SKIP_E2E" = "1" ]; then
  fail "criterion 16c cannot be verified with --skip-e2e (flicker test is e2e)"
elif [ "$e2e_ok" = "1" ]; then
  pass "flicker test present and the e2e run passed it"
else
  fail "the e2e suite did not pass — flicker test status unconfirmed (see /tmp/ae-hq-c5-e2e.log)"
fi

# ════════════════════════════════════════════════════════════════════════════
# summary
# ════════════════════════════════════════════════════════════════════════════
cleanup_dev
trap - EXIT

bold ""
bold "════════════════════════════════════════"
bold "  $PASS_CT passed, $FAIL_CT failed"
bold "════════════════════════════════════════"

if [ "$FAIL_CT" -gt 0 ]; then
  red ""
  red "Failures:"
  for f in "${FAILURES[@]}"; do red "  - $f"; done
  exit 1
fi

green ""
green "  All 16 success criteria pass. Cycle ae-hq-jobs-as-objects complete."
exit 0
