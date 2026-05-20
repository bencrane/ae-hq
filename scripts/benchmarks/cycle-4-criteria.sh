#!/usr/bin/env bash
# cycle-4-criteria.sh
#
# Harness verification for /scope cycle `ae-hq-polish-and-profiles`.
# Exit 0 ⇔ all 13 success criteria from the cycle-4 directive pass.
#
# Usage:
#   scripts/benchmarks/cycle-4-criteria.sh [--skip-storybook] [--skip-e2e]
#
# Environment:
#   This script sources `.env.local` at the repo root itself — the project
#   has NO direnv/.envrc, and the scripted checks need AE_DB_DIRECT_URL /
#   AE_SUPABASE_URL / the anon key. If a var is already exported it is left
#   untouched.
#
#   TEST_CANDIDATE_EMAIL  (default candidate1@accountexecutive.test)
#   TEST_RECRUITER_EMAIL  (default recruiter1@stripe.test)
#   TEST_PASSWORD         (default testing123!)
#
# Exit codes:
#   0  — all 13 success criteria pass
#   1  — one or more criteria failed
#   99 — missing required CLI tool
#
# Local-only: never pushes, never opens PRs. (Cycle-4 directive: local
# commits ARE expected; push / PR are explicitly forbidden — the human
# reviews `git log` + diffs.)

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
if bun install --silent > /tmp/ae-hq-c4-install.log 2>&1; then
  if bun run build > /tmp/ae-hq-c4-build.log 2>&1; then
    if [ -d "$APP_DIR/dist" ] \
       && { [ -f "$API_DIR/dist/index.js" ] || [ -f "$API_DIR/dist/server.js" ]; }; then
      pass "bun install + build clean; app/api artifacts present"
    else
      fail "build ran but app/api artifacts missing — see /tmp/ae-hq-c4-build.log"
    fi
  else
    fail "bun run build failed — see /tmp/ae-hq-c4-build.log"
  fi
else
  fail "bun install failed — see /tmp/ae-hq-c4-install.log"
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 2 — typecheck: 0 errors, no `any`
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 2 — bun run typecheck (0 errors) + no-any sweep"
if bun run typecheck > /tmp/ae-hq-c4-typecheck.log 2>&1; then
  # a literal `: any` or `as any` in source (api/app/ui). Comment lines and
  # eslint/ts-directive lines are excluded.
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
  fail "typecheck failed — see /tmp/ae-hq-c4-typecheck.log"
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 3 — lint clean; no-route-geometry still enforced
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 3 — bun run lint + no-route-geometry rule live"
if bun run lint > /tmp/ae-hq-c4-lint.log 2>&1; then
  PROBE="$APP_DIR/src/routes/__c4_lint_probe__.tsx"
  cat > "$PROBE" <<'EOF'
export function __C4LintProbe__() {
  return <div className="mx-auto max-w-3xl px-6 py-12">probe</div>;
}
EOF
  rule_triggered=0
  if bun run lint > /tmp/ae-hq-c4-lint-probe.log 2>&1; then
    rule_triggered=0
  else
    grep -qE "no-route-geometry|route-geometry" /tmp/ae-hq-c4-lint-probe.log && rule_triggered=1
  fi
  rm -f "$PROBE"
  if [ "$rule_triggered" = "1" ]; then
    pass "lint clean; no-route-geometry blocks banned classes"
  else
    fail "no-route-geometry did NOT fire on planted violation — see /tmp/ae-hq-c4-lint-probe.log"
  fi
else
  fail "baseline lint failed — see /tmp/ae-hq-c4-lint.log"
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 4 — migration 0003 applied; companies has the 4 new columns;
#               all 20 companies have non-null firmographic data
# ════════════════════════════════════════════════════════════════════════════
# This runs AFTER seed (criterion-4's data half needs the cycle-4 seed). The
# seed is run here once; criterion 4 then asserts schema + seed completeness.
step "Criterion 4 — migration 0003 + firmographic seed (run seed, then assert)"
if bun run seed > /tmp/ae-hq-c4-seed1.log 2>&1; then
  # idempotency: a second seed must not change the company row count, and
  # the firmographic columns must remain fully populated.
  CO_COUNT_SQL="select count(*) from public.companies"
  CO1="$(psql "$AE_DB_DIRECT_URL" -tAc "$CO_COUNT_SQL" 2>/dev/null | tr -d ' ')"
  if bun run seed > /tmp/ae-hq-c4-seed2.log 2>&1; then
    CO2="$(psql "$AE_DB_DIRECT_URL" -tAc "$CO_COUNT_SQL" 2>/dev/null | tr -d ' ')"
    if [ "${CO1:-x}" != "${CO2:-y}" ]; then
      fail "seed NOT idempotent — company count changed on re-run ($CO1 -> $CO2)"
    elif bun x tsx "$BENCH/check-cycle-4-schema.ts" > /tmp/ae-hq-c4-schema.log 2>&1; then
      pass "$(tail -1 /tmp/ae-hq-c4-schema.log)"
    else
      fail "cycle-4 schema/firmographic check failed — see /tmp/ae-hq-c4-schema.log"
      tail -8 /tmp/ae-hq-c4-schema.log | sed 's/^/    /'
    fi
  else
    fail "second seed run failed — see /tmp/ae-hq-c4-seed2.log"
  fi
else
  fail "seed failed — see /tmp/ae-hq-c4-seed1.log"
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 5 — storybook:build; new/changed primitives have stories;
#               test:a11y — 0 axe violations
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 5 — storybook build + per-primitive stories + axe a11y"
if [ "$SKIP_STORYBOOK" = "1" ]; then
  gray "  SKIPPED (--skip-storybook)"
else
  sb_ok=1
  if bun run storybook:build > /tmp/ae-hq-c4-sb-build.log 2>&1; then
    if bun x tsx "$BENCH/check-primitive-stories.ts" > /tmp/ae-hq-c4-stories.log 2>&1; then
      :
    else
      sb_ok=0
      fail "primitive story coverage failed — see /tmp/ae-hq-c4-stories.log"
    fi
  else
    sb_ok=0
    fail "storybook:build failed — see /tmp/ae-hq-c4-sb-build.log"
  fi
  if [ "$sb_ok" = "1" ]; then
    if bun run test:a11y > /tmp/ae-hq-c4-a11y.log 2>&1; then
      pass "storybook builds; every primitive has a story; axe-core 0 violations"
    else
      fail "axe-core found violations — see /tmp/ae-hq-c4-a11y.log"
    fi
  fi
fi

# ════════════════════════════════════════════════════════════════════════════
# Boot dev for the runtime criteria (7, 8b, 13) — e2e (criteria 6/9/10) boots
# its own server via playwright.config webServer (reuseExistingServer:true).
# ════════════════════════════════════════════════════════════════════════════
step "Booting dev server for runtime criteria"
DEV_LOG=/tmp/ae-hq-c4-dev.log
( bun run dev > "$DEV_LOG" 2>&1 & echo $! > /tmp/ae-hq-c4-dev.pid )
DEV_PID="$(cat /tmp/ae-hq-c4-dev.pid)"
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
# CRITERION 7 — bun run dev boots clean
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 7 — bun run dev boots clean"
if [ "$dev_up" = "1" ]; then
  pass "dev booted (app + api healthy)"
else
  fail "dev failed to boot (app=$app_code api=$api_code) — see $DEV_LOG"
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 8 — sidebar dividers share ONE treatment across both layouts.
#   Two complementary checks:
#     (a) check-sidebar-dividers.ts — a static className audit. Fast, no
#         browser. Catches a border-COLOR-token regression and raw hex
#         literals. NOTE: a className audit alone cannot catch an INSET
#         defect (a `border-b px-6` vs full-bleed difference), so it is a
#         pre-gate, not the sole arbiter.
#     (b) the e2e divider test (e2e/cycle-4.spec.ts) — renders BOTH
#         sidebars, reads computed border width/style/color + the left/right
#         inset of every [data-divider] element, asserts one treatment.
#         This is the real geometry arbiter; it runs inside criterion 6's
#         test:e2e. Here we assert that test EXISTS so it cannot be deleted.
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 8 — sidebar dividers share one treatment (className audit + e2e geometry)"
c8_audit_ok=0
if bun x tsx "$BENCH/check-sidebar-dividers.ts" > /tmp/ae-hq-c4-dividers.log 2>&1; then
  c8_audit_ok=1
else
  red "  className audit failed — see /tmp/ae-hq-c4-dividers.log"
  tail -10 /tmp/ae-hq-c4-dividers.log | sed 's/^/    /'
fi
C4_SPEC_FOR_C8="$REPO_ROOT/e2e/cycle-4.spec.ts"
c8_e2e_present=0
if [ -f "$C4_SPEC_FOR_C8" ] \
   && grep -q "collectDividers" "$C4_SPEC_FOR_C8" \
   && grep -q "data-divider" "$C4_SPEC_FOR_C8"; then
  c8_e2e_present=1
else
  red "  e2e divider-geometry test missing from cycle-4.spec.ts"
fi
if [ "$c8_audit_ok" = "1" ] && [ "$c8_e2e_present" = "1" ]; then
  pass "divider className audit clean; e2e geometry test present (ran under criterion 6)"
else
  fail "sidebar divider consistency not fully verified (audit=$c8_audit_ok e2e_test=$c8_e2e_present)"
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 6 + 9 + 10 + 11 + 12 — unit tests + the full e2e suite
#   The e2e suite (e2e/cycle-4.spec.ts) carries the browser-only criteria:
#     - criterion 9  flicker fix (sidebar never unmounts)
#     - criterion 10 kanban drag-and-drop persists + 6 columns reachable
#     - criterion 11 candidate detail rework
#     - criterion 12 candidate sidebar real name / no NN// eyebrow
#   plus cycle-1..3 specs (regression). Criterion 6 = unit + e2e green.
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 6 — bun run test (unit) + bun run test:e2e (incl. cycle-4 spec)"
if bun run test > /tmp/ae-hq-c4-test.log 2>&1; then
  unit_ok=1
else
  unit_ok=0
fi
if [ "$SKIP_E2E" = "1" ]; then
  [ "$unit_ok" = "1" ] && pass "unit tests green (e2e skipped — criteria 9/10/11/12 NOT verified)" \
                       || fail "unit tests failed — see /tmp/ae-hq-c4-test.log"
else
  if [ "$unit_ok" = "1" ]; then
    if bun run test:e2e > /tmp/ae-hq-c4-e2e.log 2>&1; then
      pass "unit + e2e green (cycle-4 spec covers flicker / drag / profile / sidebar-name)"
    else
      fail "e2e suite failed — see /tmp/ae-hq-c4-e2e.log"
      tail -25 /tmp/ae-hq-c4-e2e.log | sed 's/^/    /'
    fi
  else
    fail "unit tests failed — see /tmp/ae-hq-c4-test.log"
  fi
fi

# ─ Criterion 9 (explicit gate) — the cycle-4 spec MUST contain the flicker
#   test, and it must have passed above. We assert the spec file carries the
#   load-bearing test so an executor cannot quietly delete it.
step "Criterion 9 — flicker e2e test present (sidebar-never-unmounts)"
C4_SPEC="$REPO_ROOT/e2e/cycle-4.spec.ts"
if [ ! -f "$C4_SPEC" ]; then
  fail "e2e/cycle-4.spec.ts missing — the flicker test must live here"
elif ! grep -q "same DOM node" "$C4_SPEC" || ! grep -q "__flickerProbe" "$C4_SPEC"; then
  fail "cycle-4.spec.ts does not contain the sidebar-persistence (flicker) test"
elif [ "$SKIP_E2E" = "1" ]; then
  fail "criterion 9 cannot be verified with --skip-e2e (flicker test is e2e)"
elif [ "$unit_ok" = "1" ] && grep -qE "[0-9]+ passed" /tmp/ae-hq-c4-e2e.log 2>/dev/null \
     && ! grep -qE "flicker fix.*(failed|✘|✗)" /tmp/ae-hq-c4-e2e.log 2>/dev/null; then
  pass "flicker test present and the e2e run did not fail it"
else
  # if the whole e2e suite failed, criterion 6 already recorded it; here we
  # only fail criterion 9 specifically if the flicker test itself is the loser.
  if grep -qiE "flicker" /tmp/ae-hq-c4-e2e.log 2>/dev/null \
     && grep -qiE "flicker.*(✘|✗|fail)" /tmp/ae-hq-c4-e2e.log 2>/dev/null; then
    fail "the flicker (sidebar-never-unmounts) e2e test FAILED — see /tmp/ae-hq-c4-e2e.log"
  else
    fail "could not confirm the flicker test passed — inspect /tmp/ae-hq-c4-e2e.log"
  fi
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 10 — kanban drag persists stage + writes a pipeline_activity row
#   The e2e drag (above) proves the card MOVES in the UI. This scripted check
#   proves the SIDE EFFECT — a `stage_changed` pipeline_activity row — using
#   the cycle-3 API-driven move verifier (the move endpoint is unchanged; the
#   directive says "the move still writes pipeline_activity exactly as the
#   dropdown did", so the persistence contract is identical).
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 10 — pipeline move persists stage + logs a stage_changed row"
if [ "$dev_up" != "1" ]; then
  fail "skipped — dev not up"
elif bun x tsx "$BENCH/check-pipeline-move.ts" > /tmp/ae-hq-c4-pipe.log 2>&1; then
  pass "$(tail -1 /tmp/ae-hq-c4-pipe.log)  (drag-UI half asserted by e2e cycle-4 spec)"
else
  fail "pipeline move persistence check failed — see /tmp/ae-hq-c4-pipe.log"
  tail -5 /tmp/ae-hq-c4-pipe.log | sed 's/^/    /'
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 13 — all 22 routes still render without 500s;
#                PageHeader eyebrow alignment still holds across authed routes
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 13 — all 22 routes return 200 (no 500s)"
if [ "$dev_up" != "1" ]; then
  fail "skipped — dev not up"
else
  ROUTES=( "/" "/jobs/seed-job-1" "/companies/stripe" "/signin" "/signup" "/404"
           "/me" "/me/profile" "/me/intent" "/me/credentials" "/me/approvals"
           "/co" "/co/candidates" "/co/candidates/abc" "/co/company" "/co/ats" "/co/billing"
           "/inbox" "/inbox/seed-conv-1" "/insights" "/insights/seed-article-1" "/co/pipeline" )
  route_fail=0
  for r in "${ROUTES[@]}"; do
    c="$(http_status "$APP_URL$r")"
    [ "$c" = "200" ] || { red "    $r -> $c"; route_fail=1; }
  done
  [ "${#ROUTES[@]}" -eq 22 ] || red "    NOTE: route list has ${#ROUTES[@]} entries, expected 22"
  [ "$route_fail" = "0" ] && pass "all 22 routes return 200 (SPA shell)" \
                          || fail "one or more routes returned non-200"
fi

step "Criterion 13b — PageHeader eyebrow alignment holds across authed routes"
if [ "$dev_up" != "1" ]; then
  fail "skipped — dev not up"
elif [ -f "$BENCH/check-page-header-alignment.ts" ]; then
  if APP_URL="$APP_URL" \
     TEST_CANDIDATE_EMAIL="$TEST_CANDIDATE_EMAIL" \
     TEST_RECRUITER_EMAIL="$TEST_RECRUITER_EMAIL" \
     TEST_PASSWORD="$TEST_PASSWORD" \
     bun x tsx "$BENCH/check-page-header-alignment.ts" > /tmp/ae-hq-c4-align.log 2>&1; then
    pass "PageHeader eyebrow alignment within tolerance across authed routes"
  else
    fail "PageHeader alignment drifted — see /tmp/ae-hq-c4-align.log"
  fi
else
  fail "check-page-header-alignment.ts absent — cycle-2 artifact expected to exist"
fi

# ─ route-geometry AST regression (the directive keeps no-route-geometry live;
#   criterion 3 plants a probe, this asserts the existing routes stay clean) ─
step "Criterion 13c — routes still free of banned top-level geometry (AST)"
if bun x tsx "$BENCH/check-no-route-geometry.ts" > /tmp/ae-hq-c4-ast.log 2>&1; then
  pass "AST clean — no route has banned top-level geometry"
else
  fail "banned route geometry detected — see /tmp/ae-hq-c4-ast.log"
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
green "  All 13 success criteria pass. Cycle ae-hq-polish-and-profiles complete."
exit 0
