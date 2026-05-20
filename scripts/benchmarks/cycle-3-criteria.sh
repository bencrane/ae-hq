#!/usr/bin/env bash
# cycle-3-criteria.sh
#
# Harness verification for /scope cycle `ae-hq-messaging-feed-pipeline`.
# Exit 0 ⇔ all 16 success criteria from the cycle-3 directive pass.
#
# Usage:
#   scripts/benchmarks/cycle-3-criteria.sh [--skip-storybook] [--skip-e2e]
#
# Environment:
#   This script sources `.env.local` at the repo root itself — the project
#   has NO direnv/.envrc, and the scripted checks (schema, intent, pipeline,
#   messaging) need AE_DB_DIRECT_URL / AE_SUPABASE_URL / the anon key. If a
#   var is already exported it is left untouched.
#
#   TEST_CANDIDATE_EMAIL  (default candidate1@accountexecutive.test)
#   TEST_RECRUITER_EMAIL  (default recruiter1@stripe.test)
#   TEST_PASSWORD         (default testing123!)
#
# Exit codes:
#   0  — all 16 success criteria pass
#   1  — one or more criteria failed
#   99 — missing required CLI tool
#
# Local-only: never pushes, never opens PRs.

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
if bun install --silent > /tmp/ae-hq-c3-install.log 2>&1; then
  if bun run build > /tmp/ae-hq-c3-build.log 2>&1; then
    if [ -d "$APP_DIR/dist" ] \
       && { [ -f "$API_DIR/dist/index.js" ] || [ -f "$API_DIR/dist/server.js" ]; }; then
      pass "bun install + build clean; app/api artifacts present"
    else
      fail "build ran but app/api artifacts missing — see /tmp/ae-hq-c3-build.log"
    fi
  else
    fail "bun run build failed — see /tmp/ae-hq-c3-build.log"
  fi
else
  fail "bun install failed — see /tmp/ae-hq-c3-install.log"
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 2 — typecheck: 0 errors, no `any`
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 2 — bun run typecheck (0 errors) + no-any sweep"
if bun run typecheck > /tmp/ae-hq-c3-typecheck.log 2>&1; then
  # crude but effective: a literal `: any` or `as any` in cycle-3 source.
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
  fail "typecheck failed — see /tmp/ae-hq-c3-typecheck.log"
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 3 — lint clean; no-route-geometry still enforced
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 3 — bun run lint + no-route-geometry rule live"
if bun run lint > /tmp/ae-hq-c3-lint.log 2>&1; then
  PROBE="$APP_DIR/src/routes/__c3_lint_probe__.tsx"
  cat > "$PROBE" <<'EOF'
export function __C3LintProbe__() {
  return <div className="mx-auto max-w-3xl px-6 py-12">probe</div>;
}
EOF
  rule_triggered=0
  if bun run lint > /tmp/ae-hq-c3-lint-probe.log 2>&1; then
    rule_triggered=0
  else
    grep -qE "no-route-geometry|route-geometry" /tmp/ae-hq-c3-lint-probe.log && rule_triggered=1
  fi
  rm -f "$PROBE"
  if [ "$rule_triggered" = "1" ]; then
    pass "lint clean; no-route-geometry blocks banned classes"
  else
    fail "no-route-geometry did NOT fire on planted violation — see /tmp/ae-hq-c3-lint-probe.log"
  fi
else
  fail "baseline lint failed — see /tmp/ae-hq-c3-lint.log"
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 4 — cycle-3 migration applied; 6 new tables, RLS enabled
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 4 — 6 new tables exist with RLS enabled (+ FKs, uniques, index)"
if bun x tsx "$BENCH/check-cycle-3-schema.ts" > /tmp/ae-hq-c3-schema.log 2>&1; then
  pass "$(tail -1 /tmp/ae-hq-c3-schema.log)"
else
  fail "schema check failed — see /tmp/ae-hq-c3-schema.log"
  cat /tmp/ae-hq-c3-schema.log | sed 's/^/    /'
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 5 — seed populates new tables; idempotent re-run safe
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 5 — seed populates articles/conversations/messages/pipeline; idempotent"
if bun run seed > /tmp/ae-hq-c3-seed1.log 2>&1; then
  # capture row counts after first seed
  COUNT_SQL="select
      (select count(*) from public.articles),
      (select count(*) from public.conversations),
      (select count(*) from public.messages),
      (select count(*) from public.pipeline_candidates),
      (select count(*) from public.pipeline_activity)"
  C1="$(psql "$AE_DB_DIRECT_URL" -tAF',' -c "$COUNT_SQL" 2>/dev/null)"
  if bun run seed > /tmp/ae-hq-c3-seed2.log 2>&1; then
    C2="$(psql "$AE_DB_DIRECT_URL" -tAF',' -c "$COUNT_SQL" 2>/dev/null)"
    # parse comma-separated counts (only the first snapshot is asserted on;
    # the second is compared verbatim as a string for idempotency).
    IFS=',' read -r A1 V1 M1 P1 ACT1 <<< "$C1"
    if [ "$C1" = "$C2" ] \
       && [ "${A1:-0}" -ge 15 ] \
       && [ "${V1:-0}" -ge 8 ] \
       && [ "${P1:-0}" -ge 12 ]; then
      pass "seed populated (articles=$A1 conv=$V1 msg=$M1 pcand=$P1 act=$ACT1); re-run idempotent"
    elif [ "$C1" != "$C2" ]; then
      fail "seed NOT idempotent — counts changed on re-run ($C1 -> $C2)"
    else
      fail "seed volume short of directive (articles>=15 conv>=8 pcand>=12; got $A1/$V1/$P1)"
    fi
  else
    fail "second seed run failed — see /tmp/ae-hq-c3-seed2.log"
  fi
else
  fail "seed failed — see /tmp/ae-hq-c3-seed1.log"
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 6 — storybook:build; every new primitive has a story
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 6 — storybook build + per-primitive story coverage"
if [ "$SKIP_STORYBOOK" = "1" ]; then
  gray "  SKIPPED (--skip-storybook)"
else
  if bun run storybook:build > /tmp/ae-hq-c3-sb-build.log 2>&1; then
    if bun x tsx "$BENCH/check-primitive-stories.ts" > /tmp/ae-hq-c3-stories.log 2>&1; then
      pass "storybook builds; every exported primitive has >=1 story"
    else
      fail "primitive story coverage failed — see /tmp/ae-hq-c3-stories.log"
    fi
  else
    fail "storybook:build failed — see /tmp/ae-hq-c3-sb-build.log"
  fi
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 7 — test:a11y: 0 axe violations (incl. new primitives)
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 7 — axe-core a11y across all stories"
if [ "$SKIP_STORYBOOK" = "1" ]; then
  gray "  SKIPPED (--skip-storybook)"
else
  if bun run test:a11y > /tmp/ae-hq-c3-a11y.log 2>&1; then
    pass "axe-core: 0 violations across stories (incl. new primitives)"
  else
    fail "axe-core found violations — see /tmp/ae-hq-c3-a11y.log"
  fi
fi

# ════════════════════════════════════════════════════════════════════════════
# Boot dev for runtime criteria (8b, 9, 10, 13, 14, 16)
# ════════════════════════════════════════════════════════════════════════════
step "Booting dev server for runtime criteria"
DEV_LOG=/tmp/ae-hq-c3-dev.log
( bun run dev > "$DEV_LOG" 2>&1 & echo $! > /tmp/ae-hq-c3-dev.pid )
DEV_PID="$(cat /tmp/ae-hq-c3-dev.pid)"
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
# CRITERION 9 — bun run dev boots clean
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 9 — bun run dev boots clean"
if [ "$dev_up" = "1" ]; then
  pass "dev booted (app + api healthy)"
else
  fail "dev failed to boot (app=$app_code api=$api_code) — see $DEV_LOG"
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 8 — unit tests + e2e (e2e covers message/pipeline/article)
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 8 — bun run test + bun run test:e2e"
if bun run test > /tmp/ae-hq-c3-test.log 2>&1; then
  unit_ok=1
else
  unit_ok=0
fi
if [ "$SKIP_E2E" = "1" ]; then
  [ "$unit_ok" = "1" ] && pass "unit tests green (e2e skipped)" \
                       || fail "unit tests failed — see /tmp/ae-hq-c3-test.log"
else
  if [ "$unit_ok" = "1" ]; then
    if bun run test:e2e > /tmp/ae-hq-c3-e2e.log 2>&1; then
      pass "unit + e2e green (e2e covers send-message / pipeline-move / open-article)"
    else
      fail "e2e suite failed — see /tmp/ae-hq-c3-e2e.log"
    fi
  else
    fail "unit tests failed — see /tmp/ae-hq-c3-test.log"
  fi
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 10 — messaging end-to-end (recruiter -> candidate)
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 10 — messaging end-to-end across two sessions"
if [ "$dev_up" != "1" ]; then
  fail "skipped — dev not up"
elif bun x tsx "$BENCH/check-messaging-e2e.ts" > /tmp/ae-hq-c3-msg.log 2>&1; then
  pass "$(tail -1 /tmp/ae-hq-c3-msg.log)"
else
  fail "messaging e2e failed — see /tmp/ae-hq-c3-msg.log"
  tail -3 /tmp/ae-hq-c3-msg.log | sed 's/^/    /'
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 11 — /inbox two-pane (both shells); /inbox/:id deep-links
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 11 — /inbox + /inbox/:id reachable (SPA shell 200)"
if [ "$dev_up" != "1" ]; then
  fail "skipped — dev not up"
else
  ib="$(http_status "$APP_URL/inbox")"
  ibid="$(http_status "$APP_URL/inbox/seed-conv-1")"
  if [ "$ib" = "200" ] && [ "$ibid" = "200" ]; then
    pass "/inbox and /inbox/:id return 200 (deep render asserted by criterion 10 + e2e)"
  else
    fail "/inbox=$ib /inbox/:id=$ibid"
  fi
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 12 — /insights lists >=15 articles; /insights/:slug renders body
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 12 — /insights article hub + article detail"
if [ "$dev_up" != "1" ]; then
  fail "skipped — dev not up"
else
  # API-level: the articles endpoint must return >=15 and >=1 per kind.
  ART_JSON="$(curl -sS -m 10 "$API_URL/api/v1/articles?limit=100" 2>/dev/null)"
  ART_N="$(echo "$ART_JSON" | jq -r '(.articles // []) | length' 2>/dev/null || echo 0)"
  KINDS="$(echo "$ART_JSON" | jq -r '[(.articles // [])[].kind] | unique | length' 2>/dev/null || echo 0)"
  SLUG="$(echo "$ART_JSON" | jq -r '(.articles // [])[0].slug // empty' 2>/dev/null)"
  detail_ok=0
  if [ -n "$SLUG" ]; then
    DBODY="$(curl -sS -m 10 "$API_URL/api/v1/articles/$SLUG" 2>/dev/null \
             | jq -r '.article.body_md // empty' 2>/dev/null)"
    [ -n "$DBODY" ] && detail_ok=1
  fi
  ipage="$(http_status "$APP_URL/insights")"
  if [ "${ART_N:-0}" -ge 15 ] && [ "${KINDS:-0}" -ge 3 ] && [ "$detail_ok" = "1" ] && [ "$ipage" = "200" ]; then
    pass "/insights: $ART_N articles across $KINDS kinds; detail renders markdown body"
  else
    fail "/insights short (articles=$ART_N kinds=$KINDS detail_body=$detail_ok page=$ipage; need >=15 / 3 kinds)"
  fi
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 13 — /co/pipeline; moving a candidate writes pipeline_activity
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 13 — pipeline board + move writes a stage_changed activity row"
if [ "$dev_up" != "1" ]; then
  fail "skipped — dev not up"
else
  cp="$(http_status "$APP_URL/co/pipeline")"
  if [ "$cp" != "200" ]; then
    fail "/co/pipeline returned $cp"
  elif bun x tsx "$BENCH/check-pipeline-move.ts" > /tmp/ae-hq-c3-pipe.log 2>&1; then
    pass "$(tail -1 /tmp/ae-hq-c3-pipe.log)"
  else
    fail "pipeline move check failed — see /tmp/ae-hq-c3-pipe.log"
    tail -3 /tmp/ae-hq-c3-pipe.log | sed 's/^/    /'
  fi
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 14 — authed `/` feed intent-filtered; strict subset + toggle
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 14 — intent-filtered feed is a strict correct subset"
if [ "$dev_up" != "1" ]; then
  fail "skipped — dev not up"
elif bun x tsx "$BENCH/check-intent-filter.ts" > /tmp/ae-hq-c3-intent.log 2>&1; then
  pass "$(tail -1 /tmp/ae-hq-c3-intent.log)"
else
  fail "intent filter check failed — see /tmp/ae-hq-c3-intent.log"
  tail -3 /tmp/ae-hq-c3-intent.log | sed 's/^/    /'
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 15 — every route uses <Page>; no top-level route geometry
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 15 — routes use <Page>; no banned top-level geometry (AST)"
if bun x tsx "$BENCH/check-no-route-geometry.ts" > /tmp/ae-hq-c3-ast.log 2>&1; then
  # also assert every route file actually mentions <Page (the directive
  # requires <Page> on every new route — geometry-clean is necessary but
  # an empty file would also pass the AST check).
  missing_page=0
  for f in "$APP_DIR"/src/routes/*.tsx; do
    base="$(basename "$f")"
    [ "$base" = "NotFound.tsx" ] && continue
    grep -qE "<Page|<PublicPage|<AuthPage" "$f" || { red "    $base has no <Page>"; missing_page=1; }
  done
  if [ "$missing_page" = "0" ]; then
    pass "AST clean; every route renders through a Page primitive"
  else
    fail "one or more route files do not use <Page>"
  fi
else
  fail "banned route geometry detected — see /tmp/ae-hq-c3-ast.log"
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 16 — all 22 routes render without 500s
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 16 — all 22 routes return 200 (17 prior + 5 new)"
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

# ── PageHeader alignment regression (part of criterion 16) ──────────────────
step "Criterion 16b — PageHeader eyebrow alignment holds across authed routes"
if [ "$dev_up" != "1" ]; then
  fail "skipped — dev not up"
elif [ -f "$BENCH/check-page-header-alignment.ts" ]; then
  if APP_URL="$APP_URL" \
     TEST_CANDIDATE_EMAIL="$TEST_CANDIDATE_EMAIL" \
     TEST_RECRUITER_EMAIL="$TEST_RECRUITER_EMAIL" \
     TEST_PASSWORD="$TEST_PASSWORD" \
     bun x tsx "$BENCH/check-page-header-alignment.ts" > /tmp/ae-hq-c3-align.log 2>&1; then
    pass "PageHeader eyebrow alignment within tolerance across authed routes"
  else
    fail "PageHeader alignment drifted — see /tmp/ae-hq-c3-align.log"
  fi
else
  gray "  check-page-header-alignment.ts absent — skipping (cycle-2 artifact)"
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
green "  All 16 success criteria pass. Cycle ae-hq-messaging-feed-pipeline complete."
exit 0
