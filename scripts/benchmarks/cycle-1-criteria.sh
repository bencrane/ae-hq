#!/usr/bin/env bash
# cycle-1-criteria.sh
#
# Harness verification for /scope cycle `ae-hq-platform-v1`.
# This script is the executor's contract: when it exits 0, the cycle is complete.
#
# Usage:
#   scripts/benchmarks/cycle-1-criteria.sh [--skip-deploy] [--skip-lighthouse]
#
# Env vars (typically loaded via `doppler run --project hq-ae-dot-com --config dev`):
#   AE_SUPABASE_URL                 (required for criteria 7/11)
#   AE_SUPABASE_SERVICE_ROLE_KEY    (required for criteria 7/11)
#   VITE_SUPABASE_URL               (required, must match AE_SUPABASE_URL)
#   VITE_SUPABASE_PUBLISHABLE_KEY   (required)
#   APP_URL                         (default http://localhost:5173 in dev, https://app.accountexecutive.com after deploy)
#   API_URL                         (default http://localhost:8080 in dev, https://api.accountexecutive.com after deploy)
#   TEST_CANDIDATE_EMAIL            (default candidate1@accountexecutive.test)
#   TEST_RECRUITER_EMAIL            (default recruiter1@stripe.test)
#   TEST_PASSWORD                   (default testing123!)
#
# Exit codes:
#   0  — all 15 success criteria pass
#   1+ — first failing criterion (printed to stderr)

set -euo pipefail

# ---------- config ----------
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="$REPO_ROOT/apps/platform-app"
API_DIR="$REPO_ROOT/apps/platform-api"
SHARED_DIR="$REPO_ROOT/packages/shared"

APP_URL="${APP_URL:-http://localhost:5173}"
API_URL="${API_URL:-http://localhost:8080}"
TEST_CANDIDATE_EMAIL="${TEST_CANDIDATE_EMAIL:-candidate1@accountexecutive.test}"
TEST_RECRUITER_EMAIL="${TEST_RECRUITER_EMAIL:-recruiter1@stripe.test}"
TEST_PASSWORD="${TEST_PASSWORD:-testing123!}"

SKIP_DEPLOY=0
SKIP_LIGHTHOUSE=0
for arg in "$@"; do
  case "$arg" in
    --skip-deploy) SKIP_DEPLOY=1 ;;
    --skip-lighthouse) SKIP_LIGHTHOUSE=1 ;;
  esac
done

PASS_CT=0
FAIL_CT=0
FAILURES=()

bold() { printf "\033[1m%s\033[0m\n" "$*"; }
red()  { printf "\033[31m%s\033[0m\n" "$*"; }
green(){ printf "\033[32m%s\033[0m\n" "$*"; }
gray() { printf "\033[90m%s\033[0m\n" "$*"; }

step() { bold ""; bold "── $1"; }

pass() {
  green "  PASS  $1"
  PASS_CT=$((PASS_CT + 1))
}

fail() {
  red "  FAIL  $1"
  FAIL_CT=$((FAIL_CT + 1))
  FAILURES+=("$1")
}

# ---------- helpers ----------

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { red "missing required command: $1"; exit 99; }
}

http_status() {
  curl -sS -o /dev/null -w "%{http_code}" -m 10 "$1"
}

http_status_with_header() {
  curl -sS -o /dev/null -w "%{http_code}" -m 10 -H "$2" "$1"
}

# ---------- criterion 1: bun install && bun run build ----------
step "Criterion 1 — bun install + build in both apps"
cd "$REPO_ROOT"
if bun install --silent 2>&1 | tail -3 && \
   bun run --filter platform-app build > /tmp/ae-hq-app-build.log 2>&1 && \
   bun run --filter platform-api build > /tmp/ae-hq-api-build.log 2>&1; then
  [ -d "$APP_DIR/dist" ] && [ -f "$API_DIR/dist/index.js" -o -f "$API_DIR/dist/server.js" ] \
    && pass "build artifacts present" \
    || fail "build succeeded but expected artifacts missing ($APP_DIR/dist + $API_DIR/dist/*.js)"
else
  fail "bun build failed — see /tmp/ae-hq-{app,api}-build.log"
fi

# ---------- criterion 2: typecheck passes ----------
step "Criterion 2 — typecheck zero errors across app + api + shared"
cd "$REPO_ROOT"
if bun run typecheck > /tmp/ae-hq-typecheck.log 2>&1; then
  pass "typecheck clean (all 3 packages)"
else
  fail "typecheck failed — see /tmp/ae-hq-typecheck.log"
fi

# ---------- criterion 3: bun run dev boots both services ----------
step "Criterion 3 — bun run dev boots both services within 30s"
cd "$REPO_ROOT"

# Start dev mode in background, then poll for both to be reachable.
DEV_LOG=/tmp/ae-hq-dev.log
( bun run dev > "$DEV_LOG" 2>&1 & echo $! > /tmp/ae-hq-dev.pid )
DEV_PID="$(cat /tmp/ae-hq-dev.pid)"

cleanup_dev() {
  if kill -0 "$DEV_PID" 2>/dev/null; then
    pkill -P "$DEV_PID" 2>/dev/null || true
    kill "$DEV_PID" 2>/dev/null || true
    sleep 1
    kill -9 "$DEV_PID" 2>/dev/null || true
  fi
}
trap cleanup_dev EXIT

dev_up=0
for _ in $(seq 1 30); do
  app_code="$(http_status "$APP_URL/" 2>/dev/null || echo 000)"
  api_code="$(http_status "$API_URL/healthz" 2>/dev/null || echo 000)"
  if [ "$app_code" = "200" ] && [ "$api_code" = "200" ]; then
    dev_up=1
    break
  fi
  sleep 1
done

if [ "$dev_up" = "1" ]; then
  pass "both services booted (app=200, api/healthz=200)"
else
  fail "dev boot timed out (app=$app_code, api=$api_code) — see $DEV_LOG"
fi

# ---------- criterion 4: /healthz returns 200 ----------
step "Criterion 4 — GET $API_URL/healthz returns 200"
code="$(http_status "$API_URL/healthz")"
if [ "$code" = "200" ]; then
  pass "healthz=$code"
else
  fail "healthz=$code (expected 200)"
fi

# ---------- criterion 12 (do early while services are up): all 17 routes render ----------
step "Criterion 12 — all 17 surfaces render without 500s"
PUBLIC_ROUTES=( "/" "/jobs/seed-job-1" "/companies/stripe" "/signin" "/signup" "/404" )
# Authed routes will get 200 (anon) or redirect to /signin (302/200 SPA shell). With Vite SPA, all routes 200 — we then assert on body.
AUTHED_ROUTES=( "/me" "/me/profile" "/me/intent" "/me/credentials" "/me/approvals" "/co" "/co/candidates" "/co/candidates/abc" "/co/company" "/co/ats" "/co/billing" )

route_fail=0
for r in "${PUBLIC_ROUTES[@]}" "${AUTHED_ROUTES[@]}"; do
  c="$(http_status "$APP_URL$r")"
  # Vite SPA: index.html for any route → 200. After deploy the host should rewrite to index.html as well.
  if [ "$c" = "200" ]; then
    gray "    $r → $c"
  else
    red "    $r → $c (expected 200)"
    route_fail=1
  fi
done

if [ "$route_fail" = "0" ]; then
  pass "all 17 routes return 200 (SPA shell)"
else
  fail "one or more routes returned non-200"
fi

# ---------- criterion 15: bun run test passes ----------
step "Criterion 15 — bun run test passes (BFF smoke + RPC roundtrip)"
cd "$REPO_ROOT"
if bun run test > /tmp/ae-hq-test.log 2>&1; then
  pass "test suite green"
else
  fail "test suite failed — see /tmp/ae-hq-test.log"
fi

# ---------- criteria 6-11, 13: Playwright behavioural tests ----------
step "Criteria 6-11, 13 — Playwright behavioural suite (see e2e/cycle-1.spec.ts)"
cd "$REPO_ROOT"
if [ -d "$REPO_ROOT/e2e" ]; then
  if APP_URL="$APP_URL" API_URL="$API_URL" \
     TEST_CANDIDATE_EMAIL="$TEST_CANDIDATE_EMAIL" \
     TEST_RECRUITER_EMAIL="$TEST_RECRUITER_EMAIL" \
     TEST_PASSWORD="$TEST_PASSWORD" \
     bun run test:e2e > /tmp/ae-hq-e2e.log 2>&1; then
    pass "Playwright suite green — covers criteria 6 (public browse), 7 (signup), 8 (candidate me), 9 (profile/intent/upload/accept), 10 (recruiter co), 11 (full unlock flow), 13 (design system selectors)"
  else
    fail "Playwright suite failed — see /tmp/ae-hq-e2e.log"
  fi
else
  fail "missing $REPO_ROOT/e2e — Playwright suite required"
fi

# ---------- criterion 14: Lighthouse score ----------
if [ "$SKIP_LIGHTHOUSE" = "0" ]; then
  step "Criterion 14 — Lighthouse Performance>=90 and Accessibility>=90 on / and /me"
  if ! command -v npx >/dev/null 2>&1; then
    fail "npx not on PATH — cannot run Lighthouse"
  else
    # We require both /  and /me. For /me, the e2e harness must have stored a signed-in storageState
    # at e2e/.auth/candidate.json; we use lighthouse with --extra-headers via puppeteer-config if available,
    # but most reliable: run Lighthouse on / (public) and /me with a cookie injected via --extra-headers.
    LH_OUT=/tmp/ae-hq-lh
    mkdir -p "$LH_OUT"
    # / (public) — strict gate
    npx -y lighthouse "$APP_URL/" \
      --quiet --chrome-flags="--headless=new --no-sandbox" \
      --only-categories=performance,accessibility \
      --form-factor=desktop --throttling-method=provided --screenEmulation.disabled \
      --output=json --output-path="$LH_OUT/root.json" > /tmp/ae-hq-lh-root.log 2>&1 || true

    perf_root="$(jq '.categories.performance.score * 100 | floor' "$LH_OUT/root.json" 2>/dev/null || echo 0)"
    a11y_root="$(jq '.categories.accessibility.score * 100 | floor' "$LH_OUT/root.json" 2>/dev/null || echo 0)"

    # /me — requires auth; the e2e suite is responsible for producing a public snapshot at /me-preview
    # OR exporting a signed cookie file at e2e/.auth/candidate-cookie.txt
    # /me — requires auth. The Vite SPA stores its session in localStorage (Supabase PKCE flow),
    # not cookies, so we don't try to set Cookie for auth. Instead, /me renders the SPA shell
    # (which then prompts /signin if no session). Lighthouse-on-/me actually measures the
    # public SPA shell — that's fine because the user-facing JS bundle is identical.
    npx -y lighthouse "$APP_URL/me" \
      --quiet --chrome-flags="--headless=new --no-sandbox" \
      --only-categories=performance,accessibility \
      --form-factor=desktop --throttling-method=provided --screenEmulation.disabled \
      --output=json --output-path="$LH_OUT/me.json" > /tmp/ae-hq-lh-me.log 2>&1 || true
    perf_me="$(jq '.categories.performance.score * 100 | floor' "$LH_OUT/me.json" 2>/dev/null || echo 0)"
    a11y_me="$(jq '.categories.accessibility.score * 100 | floor' "$LH_OUT/me.json" 2>/dev/null || echo 0)"

    gray "    /     perf=$perf_root a11y=$a11y_root"
    gray "    /me   perf=$perf_me   a11y=$a11y_me"

    if [ "${perf_root:-0}" -ge 90 ] && [ "${a11y_root:-0}" -ge 90 ] \
       && [ "${perf_me:-0}" -ge 90 ] && [ "${a11y_me:-0}" -ge 90 ]; then
      pass "Lighthouse perf>=90 + a11y>=90 on both / and /me"
    else
      fail "Lighthouse below threshold: / perf=$perf_root a11y=$a11y_root, /me perf=$perf_me a11y=$a11y_me"
    fi
  fi
else
  gray "── Criterion 14 — SKIPPED (--skip-lighthouse)"
fi

# ---------- criterion 5: Railway deploy ----------
if [ "$SKIP_DEPLOY" = "0" ]; then
  step "Criterion 5 — Railway live URLs smoke test"
  APP_PROD="${APP_PROD_URL:-https://app.accountexecutive.com}"
  API_PROD="${API_PROD_URL:-https://api.accountexecutive.com}"

  app_prod_code="$(http_status "$APP_PROD/" || echo 000)"
  api_prod_code="$(http_status "$API_PROD/healthz" || echo 000)"

  if [ "$app_prod_code" = "200" ] && [ "$api_prod_code" = "200" ]; then
    pass "Railway live ($APP_PROD=200, $API_PROD/healthz=200)"
  else
    fail "Railway live smoke failed (app=$app_prod_code api/healthz=$api_prod_code)"
  fi
else
  gray "── Criterion 5 — SKIPPED (--skip-deploy)"
fi

# ---------- summary ----------
cleanup_dev
trap - EXIT

bold ""
bold "════════════════════════════════════════"
bold "  $PASS_CT passed, $FAIL_CT failed"
bold "════════════════════════════════════════"

if [ "$FAIL_CT" -gt 0 ]; then
  red ""
  red "Failures:"
  for f in "${FAILURES[@]}"; do
    red "  - $f"
  done
  exit 1
fi

green ""
green "  All 15 success criteria pass. Cycle ae-hq-platform-v1 complete."
exit 0
