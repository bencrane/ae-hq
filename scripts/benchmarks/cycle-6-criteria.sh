#!/usr/bin/env bash
# cycle-6-criteria.sh
#
# Harness verification for /scope cycle `ae-hq-intent-consent-matchmaking`
# (cycle 6 — intent, consent & matchmaking). Exit 0 ⇔ all 16 success criteria
# from the cycle-6 directive pass.
#
# Usage:
#   scripts/benchmarks/cycle-6-criteria.sh [--skip-storybook] [--skip-e2e]
#
# Environment:
#   This script sources `.env.local` at the repo root itself — the project
#   has NO direnv/.envrc. The scripted checks need AE_DB_DIRECT_URL,
#   AE_SUPABASE_URL, AE_SUPABASE_SERVICE_ROLE_KEY, and the anon key. If a var
#   is already exported it is kept.
#
#   The consent-engine and discoverability checks MINT throwaway auth users
#   via the Supabase admin API — they require AE_SUPABASE_SERVICE_ROLE_KEY.
#   They are hermetic: each builds its own fixture company + candidates and
#   deletes everything on exit. They do NOT depend on seed data.
#
#   TEST_CANDIDATE_EMAIL  (default candidate1@accountexecutive.test)
#   TEST_RECRUITER_EMAIL  (default recruiter1@stripe.test)
#   TEST_PASSWORD         (default testing123!)
#
# Migration note:
#   This verifier does NOT itself run `psql 0005_*.sql`. Migrations 0001-0004
#   are already applied to the shared Supabase instance; re-running them is
#   FORBIDDEN by the directive. Criterion 4 asserts the POST-STATE (the
#   `matches` + `company_match_criteria` tables and the 4 new `intent_signals`
#   columns exist). The executor applies 0005 as part of its work. If the
#   post-state is absent, criterion 4 fails loudly and the executor knows
#   0005 has not landed.
#
# Matching is a DETERMINISTIC PREDICATE FILTER — never a scoring model. The
# consent-engine check exercises resolution, not ranking; there is no ranked
# order to assert because the directive forbids ranking (cycle 7).
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

# The two consent checks need the service-role key to mint fixture auth users.
if [ -z "${AE_SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  red "AE_SUPABASE_SERVICE_ROLE_KEY is not set — the consent-engine and"
  red "discoverability checks (criteria 11/12/13/14/15) cannot mint fixtures."
  exit 99
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 1 — bun install + bun run build across all workspaces
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 1 — bun install + bun run build (all workspaces)"
if bun install --silent > /tmp/ae-hq-c6-install.log 2>&1; then
  if bun run build > /tmp/ae-hq-c6-build.log 2>&1; then
    if [ -d "$APP_DIR/dist" ] \
       && { [ -f "$API_DIR/dist/index.js" ] || [ -f "$API_DIR/dist/server.js" ]; }; then
      pass "bun install + build clean; app/api artifacts present"
    else
      fail "build ran but app/api artifacts missing — see /tmp/ae-hq-c6-build.log"
    fi
  else
    fail "bun run build failed — see /tmp/ae-hq-c6-build.log"
  fi
else
  fail "bun install failed — see /tmp/ae-hq-c6-install.log"
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 2 — typecheck: 0 errors, no `any`
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 2 — bun run typecheck (0 errors) + no-any sweep"
if bun run typecheck > /tmp/ae-hq-c6-typecheck.log 2>&1; then
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
  fail "typecheck failed — see /tmp/ae-hq-c6-typecheck.log"
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 3 — lint clean; no-route-geometry still enforced
#   (a) baseline lint passes
#   (b) a planted top-level-geometry violation makes lint FAIL — proves the
#       no-route-geometry rule is still wired and live.
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 3 — bun run lint + no-route-geometry rule live"
if bun run lint > /tmp/ae-hq-c6-lint.log 2>&1; then
  PROBE="$APP_DIR/src/routes/__c6_lint_probe__.tsx"
  cat > "$PROBE" <<'EOF'
export function __C6LintProbe__() {
  return <div className="mx-auto max-w-3xl px-6 py-12">probe</div>;
}
EOF
  rule_triggered=0
  if bun run lint > /tmp/ae-hq-c6-lint-probe.log 2>&1; then
    rule_triggered=0
  else
    grep -qE "no-route-geometry|route-geometry" /tmp/ae-hq-c6-lint-probe.log && rule_triggered=1
  fi
  rm -f "$PROBE"
  if [ "$rule_triggered" = "1" ]; then
    pass "lint clean; no-route-geometry blocks banned classes"
  else
    fail "no-route-geometry did NOT fire on planted violation — see /tmp/ae-hq-c6-lint-probe.log"
  fi
else
  fail "baseline lint failed — see /tmp/ae-hq-c6-lint.log"
fi

# ── route-geometry AST regression (cycle-2 artifact, still applies) ─────────
step "Criterion 3b — routes still free of banned top-level geometry (AST)"
if bun x tsx "$BENCH/check-no-route-geometry.ts" > /tmp/ae-hq-c6-ast.log 2>&1; then
  pass "AST clean — no route has banned top-level geometry"
else
  fail "banned route geometry detected — see /tmp/ae-hq-c6-ast.log"
  tail -8 /tmp/ae-hq-c6-ast.log | sed 's/^/    /'
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 5 (run) — run the cycle-6 seed twice; the second run must not
#   change the matches row count (idempotency — directive: "idempotent re-run
#   safe"; the natural key is UNIQUE(company_id,candidate_id,job_id)).
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 5 — run cycle-6 seed twice (idempotency), then assert"
seed_ok=0
if bun run seed > /tmp/ae-hq-c6-seed1.log 2>&1; then
  MATCH_COUNT_SQL="select count(*) from public.matches"
  MC1="$(psql "$AE_DB_DIRECT_URL" -tAc "$MATCH_COUNT_SQL" 2>/dev/null | tr -d ' ')"
  if bun run seed > /tmp/ae-hq-c6-seed2.log 2>&1; then
    MC2="$(psql "$AE_DB_DIRECT_URL" -tAc "$MATCH_COUNT_SQL" 2>/dev/null | tr -d ' ')"
    if [ -z "${MC1:-}" ] || [ -z "${MC2:-}" ]; then
      fail "could not read matches count — does the table exist? (migration 0005)"
    elif [ "$MC1" != "$MC2" ]; then
      fail "seed NOT idempotent — matches count changed on re-run ($MC1 -> $MC2)"
    else
      seed_ok=1
      gray "  seed idempotent (matches count stable at $MC1)"
    fi
  else
    fail "second seed run failed — see /tmp/ae-hq-c6-seed2.log"
  fi
else
  fail "seed failed — see /tmp/ae-hq-c6-seed1.log"
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 4 + 5 — schema (0005) + seed contents
#   check-cycle-6-schema.ts asserts: intent_signals +4 cols; matches +
#   company_match_criteria exist with RLS + UNIQUE; seed populated criteria,
#   extended intent, ~30 matches across resolved/pending_ae/pending_company;
#   match invariants (resolved⇒conversation, pending⇒no conversation).
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 4 + 5 — cycle-6 schema + seed assertion"
if bun x tsx "$BENCH/check-cycle-6-schema.ts" > /tmp/ae-hq-c6-schema.log 2>&1; then
  pass "$(tail -1 /tmp/ae-hq-c6-schema.log)"
else
  fail "cycle-6 schema/seed check failed — see /tmp/ae-hq-c6-schema.log"
  tail -16 /tmp/ae-hq-c6-schema.log | sed 's/^/    /'
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 6 — storybook:build; new primitives have stories; test:a11y clean
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 6 — storybook build + per-primitive stories + axe a11y"
if [ "$SKIP_STORYBOOK" = "1" ]; then
  gray "  SKIPPED (--skip-storybook)"
else
  sb_ok=1
  if bun run storybook:build > /tmp/ae-hq-c6-sb-build.log 2>&1; then
    if bun x tsx "$BENCH/check-primitive-stories.ts" > /tmp/ae-hq-c6-stories.log 2>&1; then
      :
    else
      sb_ok=0
      fail "primitive story coverage failed — see /tmp/ae-hq-c6-stories.log"
      tail -8 /tmp/ae-hq-c6-stories.log | sed 's/^/    /'
    fi
  else
    sb_ok=0
    fail "storybook:build failed — see /tmp/ae-hq-c6-sb-build.log"
  fi
  if [ "$sb_ok" = "1" ]; then
    if bun run test:a11y > /tmp/ae-hq-c6-a11y.log 2>&1; then
      pass "storybook builds; every primitive has a story; axe-core 0 violations"
    else
      fail "axe-core found violations — see /tmp/ae-hq-c6-a11y.log"
    fi
  fi
fi

# ════════════════════════════════════════════════════════════════════════════
# Boot dev for the runtime criteria (8, 11, 12, 13, 14, 15, 16). The e2e suite
# (criterion 7) boots its own server via playwright webServer with
# reuseExistingServer:true — it reuses this one.
# ════════════════════════════════════════════════════════════════════════════
step "Booting dev server for runtime criteria"
DEV_LOG=/tmp/ae-hq-c6-dev.log
( bun run dev > "$DEV_LOG" 2>&1 & echo $! > /tmp/ae-hq-c6-dev.pid )
DEV_PID="$(cat /tmp/ae-hq-c6-dev.pid)"
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
#   The e2e suite includes cycle-6.spec.ts (criteria 9/10/11/13/15/16) plus
#   cycle-1..5 specs (regression).
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 7 — bun run test (unit) + bun run test:e2e (incl. cycle-6 spec)"
if bun run test > /tmp/ae-hq-c6-test.log 2>&1; then
  unit_ok=1
else
  unit_ok=0
fi
e2e_ok=0
if [ "$SKIP_E2E" = "1" ]; then
  [ "$unit_ok" = "1" ] \
    && pass "unit tests green (e2e skipped — criteria 11/13/15/16 e2e NOT verified)" \
    || fail "unit tests failed — see /tmp/ae-hq-c6-test.log"
else
  if [ "$unit_ok" = "1" ]; then
    if bun run test:e2e > /tmp/ae-hq-c6-e2e.log 2>&1; then
      e2e_ok=1
      pass "unit + e2e green (cycle-6 spec covers intent / discover / consent surfaces)"
    else
      fail "e2e suite failed — see /tmp/ae-hq-c6-e2e.log"
      tail -25 /tmp/ae-hq-c6-e2e.log | sed 's/^/    /'
    fi
  else
    fail "unit tests failed — see /tmp/ae-hq-c6-test.log"
    tail -12 /tmp/ae-hq-c6-test.log | sed 's/^/    /'
  fi
fi

# ── assert the cycle-6 spec carries its load-bearing tests (anti-deletion) ──
step "Criterion 7b — cycle-6.spec.ts carries the load-bearing tests"
C6_SPEC="$REPO_ROOT/e2e/cycle-6.spec.ts"
if [ ! -f "$C6_SPEC" ]; then
  fail "e2e/cycle-6.spec.ts missing — the intent/discover/consent tests must live here"
else
  miss=()
  grep -qE "auto.?match|auto_match"       "$C6_SPEC" || miss+=("auto_match toggle test")
  grep -qE "discover|matchmaking"         "$C6_SPEC" || miss+=("discovery surface test")
  grep -qE "anonymi|initials"             "$C6_SPEC" || miss+=("anonymized-card test")
  grep -qE "express.?interest|expressInterest" "$C6_SPEC" || miss+=("express-interest test")
  if [ "${#miss[@]}" -eq 0 ]; then
    pass "cycle-6.spec.ts contains intent + discovery + anonymization + express-interest tests"
  else
    fail "cycle-6.spec.ts is missing: ${miss[*]}"
  fi
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 9 + 10 — /me/intent persists investor criteria + watched company
#   + auto_match + discoverable; the company match-criteria surface persists.
#   These are GET/PUT round-trips against the BFF — assert the persist.
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 9 + 10 — /me/intent + company match-criteria persist (API round-trip)"
if [ "$dev_up" != "1" ]; then
  fail "skipped — dev not up"
elif bun x tsx "$BENCH/check-intent-criteria-persist.ts" > /tmp/ae-hq-c6-persist.log 2>&1; then
  pass "$(tail -1 /tmp/ae-hq-c6-persist.log)"
else
  fail "intent / match-criteria persist check failed — see /tmp/ae-hq-c6-persist.log"
  tail -14 /tmp/ae-hq-c6-persist.log | sed 's/^/    /'
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 11 + 15 — discoverability rule + anonymization.
#   check-discoverability.ts CONSTRUCTS the decisive case: an AE whose
#   criteria INCLUDE the querying company (must appear), one whose criteria
#   EXCLUDE it (must NOT appear), one opted out (must NOT appear); and asserts
#   no full name leaks on a discover card, an anonymized detail, or a pending
#   match.
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 11 + 15 — discoverability filter + anonymization (constructed case)"
if [ "$dev_up" != "1" ]; then
  fail "skipped — dev not up"
elif bun x tsx "$BENCH/check-discoverability.ts" > /tmp/ae-hq-c6-discover.log 2>&1; then
  pass "$(tail -1 /tmp/ae-hq-c6-discover.log)"
else
  fail "discoverability / anonymization check failed — see /tmp/ae-hq-c6-discover.log"
  tail -20 /tmp/ae-hq-c6-discover.log | sed 's/^/    /'
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 12 + 13 + 14 — the consent state machine.
#   check-consent-engine.ts walks all three resolution paths against the live
#   BFF with hermetic fixtures:
#     12 — AE-initiated, AE satisfies criteria → immediate resolve + idempotent
#     13 — company-initiated, auto_match off → pending_ae → accept → resolved
#     14 — company-initiated, auto_match on + fit → immediate resolve, no prompt
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 12 + 13 + 14 — consent engine: all three resolution paths"
if [ "$dev_up" != "1" ]; then
  fail "skipped — dev not up"
elif bun x tsx "$BENCH/check-consent-engine.ts" > /tmp/ae-hq-c6-consent.log 2>&1; then
  pass "$(tail -1 /tmp/ae-hq-c6-consent.log)"
else
  fail "consent-engine check failed — see /tmp/ae-hq-c6-consent.log"
  tail -24 /tmp/ae-hq-c6-consent.log | sed 's/^/    /'
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 16 — all routes (cycle 1-5 + new) return 200 (no 500s);
#   the cycle-4 flicker fix still holds; the cycle-5 kanban width still holds.
#   16a — route sweep (incl. new matchmaking routes);
#   16b — cycle-4 PageHeader alignment;
#   16c — cycle-5 kanban width (the standalone width arbiter);
#   16d — flicker e2e still present + green.
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 16a — all routes return 200 (no 500s)"
if [ "$dev_up" != "1" ]; then
  fail "skipped — dev not up"
else
  # cycle-1..5 routes + the cycle-6 additions. The new routes' exact paths are
  # the executor's call (the directive says /me/intent rework, a company
  # match-criteria surface, and /co/discover-or-rework-/co/candidates). The
  # SPA serves a 200 shell for ANY path, so this sweep proves the shell does
  # not 500; the e2e cycle-6 spec proves the new surfaces actually render
  # their content. We sweep the known-fixed routes plus /me/intent and
  # /co/candidates (reworked, must still 200).
  ROUTES=( "/" "/companies/stripe" "/signin" "/signup" "/404"
           "/me" "/me/profile" "/me/intent" "/me/credentials" "/me/approvals"
           "/me/jobs"
           "/co" "/co/candidates" "/co/candidates/abc" "/co/company" "/co/ats"
           "/co/billing" "/co/pipeline" "/co/jobs"
           "/inbox" "/inbox/seed-conv-1" "/insights" "/insights/seed-article-1" )
  route_fail=0
  for r in "${ROUTES[@]}"; do
    c="$(http_status "$APP_URL$r")"
    [ "$c" = "200" ] || { red "    $r -> $c"; route_fail=1; }
  done
  # /jobs/:id and /co/jobs/:id — discover a real job id (jobs.id is a uuid).
  JOB_ID="$(psql "$AE_DB_DIRECT_URL" -tAc \
    "select id from public.jobs order by posted_at desc nulls last limit 1" 2>/dev/null \
    | tr -d ' ')"
  if [ -n "$JOB_ID" ]; then
    for r in "/jobs/$JOB_ID" "/co/jobs/$JOB_ID"; do
      c="$(http_status "$APP_URL$r")"
      [ "$c" = "200" ] || { red "    $r -> $c"; route_fail=1; }
    done
  else
    red "    could not discover a job id for /jobs/:id and /co/jobs/:id"
    route_fail=1
  fi
  [ "$route_fail" = "0" ] \
    && pass "all cycle-1..6 routes return 200 (SPA shell; incl. /me/intent, /co/candidates)" \
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
     bun x tsx "$BENCH/check-page-header-alignment.ts" > /tmp/ae-hq-c6-align.log 2>&1; then
    pass "PageHeader eyebrow alignment within tolerance across authed routes"
  else
    fail "PageHeader alignment drifted — see /tmp/ae-hq-c6-align.log"
  fi
else
  fail "check-page-header-alignment.ts absent — cycle-2 artifact expected to exist"
fi

# ─ Criterion 16c — the cycle-5 kanban-width arbiter must still pass. The
#   directive (criterion 16) says the cycle-5 kanban width must still hold.
#   check-kanban-width.ts measures rendered column widths on /co/jobs/:id.
step "Criterion 16c — cycle-5 kanban column width still holds (>= 280px)"
if [ "$dev_up" != "1" ]; then
  fail "skipped — dev not up"
elif [ -f "$BENCH/check-kanban-width.ts" ]; then
  if bun x tsx "$BENCH/check-kanban-width.ts" > /tmp/ae-hq-c6-kanban.log 2>&1; then
    pass "kanban columns still >= 280px, board scrolls, no clip (cycle-5 fix holds)"
  else
    fail "kanban geometry regressed — see /tmp/ae-hq-c6-kanban.log"
    tail -14 /tmp/ae-hq-c6-kanban.log | sed 's/^/    /'
  fi
else
  fail "check-kanban-width.ts absent — cycle-5 artifact expected to exist"
fi

# ─ Criterion 16d — the cycle-4 flicker fix must still hold. The cycle-6 spec
#   re-asserts the sidebar is the same DOM node across an in-portal nav.
step "Criterion 16d — cycle-4 flicker fix still holds (sidebar persists across nav)"
if [ ! -f "$C6_SPEC" ]; then
  fail "e2e/cycle-6.spec.ts missing — the flicker re-assertion lives here"
elif ! grep -qE "__c.flicker|flicker" "$C6_SPEC" || ! grep -q "same DOM node" "$C6_SPEC"; then
  fail "cycle-6.spec.ts does not contain the sidebar-persistence (flicker) test"
elif [ "$SKIP_E2E" = "1" ]; then
  fail "criterion 16d cannot be verified with --skip-e2e (flicker test is e2e)"
elif [ "$e2e_ok" = "1" ]; then
  pass "flicker test present and the e2e run passed it"
else
  fail "the e2e suite did not pass — flicker test status unconfirmed (see /tmp/ae-hq-c6-e2e.log)"
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
green "  All 16 success criteria pass. Cycle ae-hq-intent-consent-matchmaking complete."
exit 0
