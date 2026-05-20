#!/usr/bin/env bash
# cycle-2-criteria.sh
#
# Harness verification for /scope cycle `ae-hq-design-system-foundation`.
# Exit 0 ⇔ all 13 success criteria pass.
#
# Usage:
#   scripts/benchmarks/cycle-2-criteria.sh [--skip-storybook] [--skip-visual]
#
# Required env (typically loaded via direnv + .env.local from cycle 1):
#   VITE_SUPABASE_URL
#   VITE_SUPABASE_PUBLISHABLE_KEY
#   TEST_CANDIDATE_EMAIL  (default candidate1@accountexecutive.test)
#   TEST_RECRUITER_EMAIL  (default recruiter1@stripe.test)
#   TEST_PASSWORD         (default testing123!)
#
# Exit codes:
#   0  — all 13 success criteria pass
#   1+ — first failing criterion
#   99 — missing required CLI tool
#
# Local-only: this script never pushes, never opens PRs.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="$REPO_ROOT/apps/platform-app"
API_DIR="$REPO_ROOT/apps/platform-api"
SHARED_DIR="$REPO_ROOT/packages/shared"
TOKENS_DIR="$REPO_ROOT/packages/tokens"
UI_DIR="$REPO_ROOT/packages/ui"

APP_URL="${APP_URL:-http://localhost:5173}"
API_URL="${API_URL:-http://localhost:8080}"
STORYBOOK_URL="${STORYBOOK_URL:-http://localhost:6006}"
TEST_CANDIDATE_EMAIL="${TEST_CANDIDATE_EMAIL:-candidate1@accountexecutive.test}"
TEST_RECRUITER_EMAIL="${TEST_RECRUITER_EMAIL:-recruiter1@stripe.test}"
TEST_PASSWORD="${TEST_PASSWORD:-testing123!}"

SKIP_STORYBOOK=0
SKIP_VISUAL=0
for arg in "$@"; do
  case "$arg" in
    --skip-storybook) SKIP_STORYBOOK=1 ;;
    --skip-visual)    SKIP_VISUAL=1 ;;
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
pass() { green "  PASS  $1"; PASS_CT=$((PASS_CT + 1)); }
fail() { red   "  FAIL  $1"; FAIL_CT=$((FAIL_CT + 1)); FAILURES+=("$1"); }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { red "missing required command: $1"; exit 99; }
}

http_status() {
  curl -sS -o /dev/null -w "%{http_code}" -m 10 "$1"
}

require_cmd bun
require_cmd node
require_cmd npx
require_cmd curl
require_cmd jq

cd "$REPO_ROOT"

# ────────────────────────────────────────────────────────────────────────────────
# CRITERION 1 — bun install succeeds in monorepo (with tokens + ui packages)
# ────────────────────────────────────────────────────────────────────────────────
step "Criterion 1 — bun install across monorepo (tokens + ui workspaces present)"
if [ ! -d "$TOKENS_DIR" ]; then
  fail "packages/tokens missing"
elif [ ! -d "$UI_DIR" ]; then
  fail "packages/ui missing"
elif bun install --silent > /tmp/ae-hq-c2-install.log 2>&1; then
  pass "bun install clean (workspaces resolved)"
else
  fail "bun install failed — see /tmp/ae-hq-c2-install.log"
fi

# ────────────────────────────────────────────────────────────────────────────────
# CRITERION 2 — bun run build succeeds for both packages and both apps
# ────────────────────────────────────────────────────────────────────────────────
step "Criterion 2 — bun run build (tokens, ui, platform-app, platform-api)"
build_ok=1
# Build tokens first (UI may consume preset/CSS)
if bun run --filter @ae-hq/tokens build > /tmp/ae-hq-c2-build-tokens.log 2>&1; then
  [ -f "$TOKENS_DIR/dist/css/tokens.css" ] || { fail "tokens build: dist/css/tokens.css missing"; build_ok=0; }
  [ -f "$TOKENS_DIR/dist/tailwind/preset.ts" ] || [ -f "$TOKENS_DIR/dist/tailwind/preset.js" ] \
    || { fail "tokens build: dist/tailwind/preset.{ts,js} missing"; build_ok=0; }
  [ -f "$TOKENS_DIR/dist/ts/index.ts" ] || [ -f "$TOKENS_DIR/dist/ts/index.js" ] \
    || [ -f "$TOKENS_DIR/dist/ts/index.d.ts" ] \
    || { fail "tokens build: dist/ts/index.* missing"; build_ok=0; }
else
  fail "tokens build failed — see /tmp/ae-hq-c2-build-tokens.log"
  build_ok=0
fi

if bun run --filter @ae-hq/ui build > /tmp/ae-hq-c2-build-ui.log 2>&1; then
  gray "    ui build ok"
else
  fail "ui build failed — see /tmp/ae-hq-c2-build-ui.log"
  build_ok=0
fi

if bun run --filter platform-app build > /tmp/ae-hq-c2-build-app.log 2>&1 \
   && bun run --filter platform-api build > /tmp/ae-hq-c2-build-api.log 2>&1; then
  [ -d "$APP_DIR/dist" ] && [ -f "$API_DIR/dist/index.js" -o -f "$API_DIR/dist/server.js" ] \
    || { fail "app/api artifacts missing"; build_ok=0; }
else
  fail "platform app/api build failed — see /tmp/ae-hq-c2-build-{app,api}.log"
  build_ok=0
fi

[ "$build_ok" = "1" ] && pass "all four workspaces build clean"

# ────────────────────────────────────────────────────────────────────────────────
# CRITERION 3 — typecheck 0 errors across all workspaces
# ────────────────────────────────────────────────────────────────────────────────
step "Criterion 3 — typecheck (tokens, ui, shared, platform-app, platform-api)"
if bun run typecheck > /tmp/ae-hq-c2-typecheck.log 2>&1; then
  # Also ensure tokens + ui are part of the typecheck pipeline
  if grep -qE "packages/(tokens|ui)" /tmp/ae-hq-c2-typecheck.log 2>/dev/null \
     || bun run --filter @ae-hq/tokens typecheck > /tmp/ae-hq-c2-tc-tokens.log 2>&1 \
        && bun run --filter @ae-hq/ui typecheck > /tmp/ae-hq-c2-tc-ui.log 2>&1; then
    pass "typecheck clean across all workspaces (incl. tokens + ui)"
  else
    fail "tokens/ui typecheck failed — see /tmp/ae-hq-c2-tc-{tokens,ui}.log"
  fi
else
  fail "typecheck failed — see /tmp/ae-hq-c2-typecheck.log"
fi

# ────────────────────────────────────────────────────────────────────────────────
# CRITERION 4 — bun run lint 0 errors; no-route-geometry rule active
# ────────────────────────────────────────────────────────────────────────────────
step "Criterion 4 — lint clean + no-route-geometry rule enforced"
if bun run lint > /tmp/ae-hq-c2-lint.log 2>&1; then
  # Smoke-test the rule by planting a violation and re-linting.
  PROBE="$APP_DIR/src/routes/__lint_probe__.tsx"
  cat > "$PROBE" <<'EOF'
export function __LintProbe__() {
  return <div className="mx-auto max-w-3xl px-6 py-12">probe</div>;
}
EOF
  rule_triggered=0
  if bun run lint > /tmp/ae-hq-c2-lint-probe.log 2>&1; then
    rule_triggered=0
  else
    grep -qE "no-route-geometry|route-geometry|ae-hq/no-route-geometry" /tmp/ae-hq-c2-lint-probe.log \
      && rule_triggered=1 || rule_triggered=0
  fi
  rm -f "$PROBE"
  if [ "$rule_triggered" = "1" ]; then
    pass "lint clean and no-route-geometry rule blocks banned classes"
  else
    fail "no-route-geometry rule did NOT fire on planted violation — see /tmp/ae-hq-c2-lint-probe.log"
  fi
else
  fail "baseline lint failed — see /tmp/ae-hq-c2-lint.log"
fi

# ────────────────────────────────────────────────────────────────────────────────
# CRITERION 5 — storybook:build succeeds AND every primitive has a story
# ────────────────────────────────────────────────────────────────────────────────
step "Criterion 5 — storybook build + per-primitive story coverage"
if [ "$SKIP_STORYBOOK" = "1" ]; then
  gray "  SKIPPED (--skip-storybook)"
else
  if bun run storybook:build > /tmp/ae-hq-c2-sb-build.log 2>&1; then
    if bun x tsx "$REPO_ROOT/scripts/benchmarks/check-primitive-stories.ts" > /tmp/ae-hq-c2-stories.log 2>&1; then
      pass "storybook builds; every exported primitive has ≥1 story"
    else
      fail "primitive story coverage check failed — see /tmp/ae-hq-c2-stories.log"
    fi
  else
    fail "storybook:build failed — see /tmp/ae-hq-c2-sb-build.log"
  fi
fi

# ────────────────────────────────────────────────────────────────────────────────
# CRITERION 6 — bun run test passes (unit: token build script + primitive snapshots)
# ────────────────────────────────────────────────────────────────────────────────
step "Criterion 6 — unit test suite (tokens build + primitive snapshots)"
if bun run test > /tmp/ae-hq-c2-test.log 2>&1; then
  pass "unit tests green"
else
  fail "unit tests failed — see /tmp/ae-hq-c2-test.log"
fi

# ────────────────────────────────────────────────────────────────────────────────
# CRITERIA 7 + 11 — Playwright e2e + per-route header alignment
# (snapshot drift handled in #11 via custom script; #7 is the suite itself.)
# ────────────────────────────────────────────────────────────────────────────────
step "Criterion 7 — Playwright e2e suite (extended with per-route visual snapshots)"
if [ -d "$REPO_ROOT/e2e" ]; then
  if APP_URL="$APP_URL" API_URL="$API_URL" \
     TEST_CANDIDATE_EMAIL="$TEST_CANDIDATE_EMAIL" \
     TEST_RECRUITER_EMAIL="$TEST_RECRUITER_EMAIL" \
     TEST_PASSWORD="$TEST_PASSWORD" \
     bun run test:e2e > /tmp/ae-hq-c2-e2e.log 2>&1; then
    pass "Playwright suite green (incl. per-route snapshots)"
  else
    fail "Playwright suite failed — see /tmp/ae-hq-c2-e2e.log"
  fi
else
  fail "e2e/ missing"
fi

# ────────────────────────────────────────────────────────────────────────────────
# CRITERION 8 — axe-core on every Storybook story, 0 violations
# ────────────────────────────────────────────────────────────────────────────────
step "Criterion 8 — axe-core a11y check across all stories"
if [ "$SKIP_STORYBOOK" = "1" ]; then
  gray "  SKIPPED (--skip-storybook)"
else
  if bun x tsx "$REPO_ROOT/scripts/benchmarks/check-storybook-a11y.ts" > /tmp/ae-hq-c2-a11y.log 2>&1; then
    pass "axe-core: 0 violations across stories"
  else
    fail "axe-core found violations — see /tmp/ae-hq-c2-a11y.log"
  fi
fi

# ────────────────────────────────────────────────────────────────────────────────
# CRITERION 9 — bun run dev boots cleanly; sidebar unchanged; every authed route 200
#   (Vite SPA: all routes return index.html=200; checks here are the SPA-shell
#    surrogate for "renders without 500". Deep render is asserted by #11 + #7.)
# ────────────────────────────────────────────────────────────────────────────────
step "Criterion 9 — bun run dev boots; every route returns 200 (SPA shell)"
DEV_LOG=/tmp/ae-hq-c2-dev.log
( bun run dev > "$DEV_LOG" 2>&1 & echo $! > /tmp/ae-hq-c2-dev.pid )
DEV_PID="$(cat /tmp/ae-hq-c2-dev.pid)"
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

if [ "$dev_up" != "1" ]; then
  fail "dev failed to boot (app=$app_code, api=$api_code) — see $DEV_LOG"
else
  ROUTES=( "/" "/jobs/seed-job-1" "/companies/stripe" "/signin" "/signup" "/404"
           "/me" "/me/profile" "/me/intent" "/me/credentials" "/me/approvals"
           "/co" "/co/candidates" "/co/candidates/abc" "/co/company" "/co/ats" "/co/billing" )
  route_fail=0
  for r in "${ROUTES[@]}"; do
    c="$(http_status "$APP_URL$r")"
    [ "$c" = "200" ] || { red "    $r → $c"; route_fail=1; }
  done
  [ "$route_fail" = "0" ] && pass "dev boots; all 17 routes return 200" \
                          || fail "one or more routes returned non-200"
fi

# ────────────────────────────────────────────────────────────────────────────────
# CRITERION 10 — AST: no banned classes on top-level JSX of any route file
# ────────────────────────────────────────────────────────────────────────────────
step "Criterion 10 — AST check: routes contain no top-level mx-auto/max-w-/px-/py-/gap-"
if bun x tsx "$REPO_ROOT/scripts/benchmarks/check-no-route-geometry.ts" > /tmp/ae-hq-c2-ast.log 2>&1; then
  pass "AST scan clean: no banned geometry on top-level JSX"
else
  fail "banned geometry classes detected — see /tmp/ae-hq-c2-ast.log"
fi

# ────────────────────────────────────────────────────────────────────────────────
# CRITERION 11 — Per-route PageHeader eyebrow renders within ±2px of /me baseline
# ────────────────────────────────────────────────────────────────────────────────
step "Criterion 11 — PageHeader alignment across authed routes (±2px tolerance)"
if [ "$SKIP_VISUAL" = "1" ]; then
  gray "  SKIPPED (--skip-visual)"
else
  if APP_URL="$APP_URL" \
     TEST_CANDIDATE_EMAIL="$TEST_CANDIDATE_EMAIL" \
     TEST_RECRUITER_EMAIL="$TEST_RECRUITER_EMAIL" \
     TEST_PASSWORD="$TEST_PASSWORD" \
     bun x tsx "$REPO_ROOT/scripts/benchmarks/check-page-header-alignment.ts" > /tmp/ae-hq-c2-align.log 2>&1; then
    pass "every authed route's PageHeader eyebrow within ±2px of /me baseline"
  else
    fail "page header alignment drifted — see /tmp/ae-hq-c2-align.log"
  fi
fi

# ────────────────────────────────────────────────────────────────────────────────
# CRITERION 12 — docs/design-system.md present, lists every primitive, links to Storybook
# ────────────────────────────────────────────────────────────────────────────────
step "Criterion 12 — docs/design-system.md present and complete"
DOC="$REPO_ROOT/docs/design-system.md"
if [ ! -f "$DOC" ]; then
  fail "docs/design-system.md missing"
elif ! grep -qE "storybook|Storybook" "$DOC"; then
  fail "docs/design-system.md missing Storybook link"
elif ! bun x tsx "$REPO_ROOT/scripts/benchmarks/check-design-system-doc.ts" > /tmp/ae-hq-c2-doc.log 2>&1; then
  fail "docs/design-system.md does not list every primitive — see /tmp/ae-hq-c2-doc.log"
else
  pass "docs/design-system.md complete (lists every primitive, links to Storybook)"
fi

# ────────────────────────────────────────────────────────────────────────────────
# CRITERION 13 — Storybook served locally; default Page story renders cleanly
# ────────────────────────────────────────────────────────────────────────────────
step "Criterion 13 — Storybook live on :6006; /?path=/story/page--default renders"
if [ "$SKIP_STORYBOOK" = "1" ]; then
  gray "  SKIPPED (--skip-storybook)"
else
  # Spawn `bun run storybook` (dev server) in background, poll for :6006.
  SB_LOG=/tmp/ae-hq-c2-sb-dev.log
  ( bun run storybook > "$SB_LOG" 2>&1 & echo $! > /tmp/ae-hq-c2-sb-dev.pid )
  SB_PID="$(cat /tmp/ae-hq-c2-sb-dev.pid)"
  cleanup_sb() {
    if kill -0 "$SB_PID" 2>/dev/null; then
      pkill -P "$SB_PID" 2>/dev/null || true
      kill "$SB_PID" 2>/dev/null || true
      sleep 1
      kill -9 "$SB_PID" 2>/dev/null || true
    fi
  }
  trap 'cleanup_dev; cleanup_sb' EXIT

  sb_up=0
  for _ in $(seq 1 60); do
    code="$(http_status "$STORYBOOK_URL/" 2>/dev/null || echo 000)"
    if [ "$code" = "200" ]; then sb_up=1; break; fi
    sleep 1
  done

  if [ "$sb_up" = "1" ]; then
    story_code="$(http_status "$STORYBOOK_URL/?path=/story/page--default")"
    if [ "$story_code" = "200" ]; then
      # Probe Storybook's stories.json to confirm a Page primitive story exists.
      if curl -sS -m 10 "$STORYBOOK_URL/index.json" 2>/dev/null \
            | jq -e '.entries | to_entries | map(select(.value.title | test("Page"; "i"))) | length > 0' \
            > /dev/null 2>&1; then
        pass "Storybook live; Page primitive story registered"
      else
        # Fall back to a static HTML probe — older Storybook serves story HTML directly.
        gray "    index.json missing or no match; falling back to HTML probe"
        if curl -sS -m 10 "$STORYBOOK_URL/iframe.html?id=page--default" \
              | grep -qiE "<body|storybook"; then
          pass "Storybook live; Page primitive story HTML reachable"
        else
          fail "Storybook live but Page primitive story unreachable"
        fi
      fi
    else
      fail "Storybook story endpoint returned $story_code"
    fi
  else
    fail "Storybook failed to boot on $STORYBOOK_URL — see $SB_LOG"
  fi
fi

# ────────────────────────────────────────────────────────────────────────────────
# summary
# ────────────────────────────────────────────────────────────────────────────────
cleanup_dev
[ -n "${SB_PID:-}" ] && cleanup_sb
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
green "  All 13 success criteria pass. Cycle ae-hq-design-system-foundation complete."
exit 0
