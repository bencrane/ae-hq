#!/usr/bin/env bash
# cycle-7-criteria.sh
#
# Harness verification for /scope cycle `ae-hq-railway-deploy-prep`
# (cycle 7 — Railway deploy prep: Dockerfiles + dashboard guide).
# Exit 0 ⇔ all 9 success criteria from the cycle-7 directive pass.
#
# Usage:
#   scripts/benchmarks/cycle-7-criteria.sh [--skip-docker] [--skip-dev]
#
#   --skip-docker  Skip criterion 4 (real `docker build`). The directive's
#                  Pre-flight CONFIRMS Docker 29.4.0 is available, so the
#                  executor MUST NOT pass this for sign-off. It exists only
#                  for fast inner-loop iteration on the non-Docker checks.
#                  When passed, criterion 4 is reported FAIL (not skipped) so
#                  a --skip-docker run can never read as green.
#   --skip-dev     Skip criterion 9 (the `bun run dev` boot smoke test).
#                  Same rule: criterion 9 is reported FAIL when skipped.
#
# This cycle is DEPLOY-PREP ONLY. The verifier never runs the Railway CLI,
# never deploys, never logs in to Railway. It validates that the two service
# Dockerfiles build clean under real Docker, that both railway.json files are
# well-formed, that platform-app/Dockerfile takes the VITE_* build args, that
# the env-var contract + the operator dashboard guide exist and are complete,
# and that the platform still boots locally.
#
# Docker context note:
#   Each railway.json sets `dockerfilePath` but NOT a build context, so Railway
#   builds from the repo root. This verifier mirrors that exactly:
#       docker build -f apps/<svc>/Dockerfile <REPO_ROOT>
#   If a future railway.json adds an explicit context, update DOCKER_CONTEXT.
#
# docker build is SLOW (Alpine base pulls, two bun installs, a vite build).
# DOCKER_BUILD_TIMEOUT defaults to 1200s (20 min) PER image. Override via env.
#
# Environment:
#   Sources `.env.local` at the repo root (no direnv in this project) so the
#   dev-boot smoke test has AE_SUPABASE_* + VITE_* in scope. docker build for
#   platform-app is run with PLACEHOLDER VITE_* build args — the build must
#   succeed without real secrets; baking real values is the operator's job in
#   the Railway dashboard, not this verifier's.
#
# Exit codes:
#   0  — all 9 success criteria pass
#   1  — one or more criteria failed
#   99 — missing required CLI tool / cannot locate repo root

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="$REPO_ROOT/apps/platform-app"
API_DIR="$REPO_ROOT/apps/platform-api"
DOCKER_CONTEXT="$REPO_ROOT"

API_DOCKERFILE="apps/platform-api/Dockerfile"
APP_DOCKERFILE="apps/platform-app/Dockerfile"
API_RAILWAY_JSON="$API_DIR/railway.json"
APP_RAILWAY_JSON="$APP_DIR/railway.json"

# Deliverable documents. The directive names the guide path explicitly. The
# env-var contract has no mandated path — accept any of the plausible ones the
# executor may pick (a standalone file, or a section folded into the guide).
GUIDE_DOC="$HOME/Desktop/hq/reports/2026-05-20-ae-hq-railway-deploy-guide.md"
ENV_CONTRACT_CANDIDATES=(
  "$HOME/Desktop/hq/reports/2026-05-20-ae-hq-railway-env-contract.md"
  "$REPO_ROOT/docs/railway-env-contract.md"
  "$REPO_ROOT/docs/deploy/railway-env-contract.md"
  "$REPO_ROOT/apps/platform-api/.env.railway.example"
  "$GUIDE_DOC"
)

APP_URL="${APP_URL:-http://localhost:5173}"
API_URL="${API_URL:-http://localhost:8080}"
DOCKER_BUILD_TIMEOUT="${DOCKER_BUILD_TIMEOUT:-1200}"

SKIP_DOCKER=0
SKIP_DEV=0
for arg in "$@"; do
  case "$arg" in
    --skip-docker) SKIP_DOCKER=1 ;;
    --skip-dev)    SKIP_DEV=1 ;;
    *) echo "unknown arg: $arg" >&2; exit 99 ;;
  esac
done

# ── source .env.local (no direnv in this project) ───────────────────────────
if [ -f "$REPO_ROOT/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$REPO_ROOT/.env.local"
  set +a
fi
export APP_URL API_URL

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
info() { gray  "        $1"; }

http_status() {
  curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$1" 2>/dev/null || echo 000
}

# ── required tooling ────────────────────────────────────────────────────────
need() { command -v "$1" >/dev/null 2>&1 || { red "missing required tool: $1"; exit 99; }; }
need bun
need curl
need git
# `jq` is preferred for JSON validation; if absent we fall back to bun.
HAVE_JQ=0
command -v jq >/dev/null 2>&1 && HAVE_JQ=1
# docker is required UNLESS --skip-docker (which itself fails criterion 4).
if [ "$SKIP_DOCKER" = "0" ]; then
  command -v docker >/dev/null 2>&1 || { red "docker not found — install Docker or pass --skip-docker (which fails criterion 4)"; exit 99; }
fi

bold "════════════════════════════════════════════════════════════════"
bold "  cycle-7 verifier — ae-hq-railway-deploy-prep"
bold "  repo: $REPO_ROOT"
bold "════════════════════════════════════════════════════════════════"

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 1 — bun install --frozen-lockfile succeeds from a clean state
#   "Clean state" = node_modules removed. The frozen flag is load-bearing:
#   it proves bun.lock matches every workspace package.json. If cycle 2-6
#   added @ae-hq/tokens / @ae-hq/ui / eslint-plugin-ae-hq without the lockfile
#   being regenerated, --frozen-lockfile fails here — exactly the class of bug
#   that would also break a Docker build.
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 1 — clean bun install --frozen-lockfile"
C1_LOG=/tmp/ae-hq-c7-install.log
info "removing node_modules trees for a pristine install…"
rm -rf "$REPO_ROOT/node_modules" \
       "$REPO_ROOT"/apps/*/node_modules \
       "$REPO_ROOT"/packages/*/node_modules 2>/dev/null || true
if (cd "$REPO_ROOT" && bun install --frozen-lockfile) > "$C1_LOG" 2>&1; then
  pass "bun install --frozen-lockfile clean from a pristine checkout"
else
  fail "bun install --frozen-lockfile FAILED — lockfile drift; see $C1_LOG"
  info "$(tail -n 4 "$C1_LOG" 2>/dev/null | sed 's/^/  | /')"
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 2 — bun run build succeeds for both apps + all packages
#   Root `build` script: tokens build → platform-app build → platform-api
#   build. @ae-hq/tokens is a BUILT package (main: dist/ts/index.js); ui and
#   platform-app consume its dist/. A green build proves the dependency order
#   is intact — and is the host-side analogue of what the Dockerfiles must do.
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 2 — bun run build (all workspaces)"
C2_LOG=/tmp/ae-hq-c7-build.log
if (cd "$REPO_ROOT" && bun run build) > "$C2_LOG" 2>&1; then
  app_dist="$APP_DIR/dist/index.html"
  api_dist="$API_DIR/dist/index.js"
  tok_dist="$REPO_ROOT/packages/tokens/dist/ts/index.js"
  miss=()
  [ -f "$app_dist" ] || miss+=("platform-app/dist/index.html")
  [ -f "$api_dist" ] || miss+=("platform-api/dist/index.js")
  [ -f "$tok_dist" ] || miss+=("packages/tokens/dist/ts/index.js")
  if [ ${#miss[@]} -eq 0 ]; then
    pass "bun run build clean; app + api + tokens artifacts present"
  else
    fail "bun run build exited 0 but artifacts missing: ${miss[*]}"
  fi
else
  fail "bun run build FAILED — see $C2_LOG"
  info "$(tail -n 6 "$C2_LOG" 2>/dev/null | sed 's/^/  | /')"
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 3 — bun run typecheck, 0 errors
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 3 — bun run typecheck (0 errors)"
C3_LOG=/tmp/ae-hq-c7-typecheck.log
if (cd "$REPO_ROOT" && bun run typecheck) > "$C3_LOG" 2>&1; then
  pass "typecheck clean across all 6 tsconfig projects"
else
  fail "typecheck reported errors — see $C3_LOG"
  info "$(grep -E 'error TS|: error' "$C3_LOG" 2>/dev/null | head -n 5 | sed 's/^/  | /')"
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 4 — real `docker build` succeeds for BOTH service Dockerfiles
#
#   LOAD-BEARING. Docker IS available (directive Pre-flight confirms 29.4.0).
#   The verifier runs an actual `docker build` for each Dockerfile from the
#   repo root (matching Railway's no-context-specified behaviour) and requires
#   exit 0. The no-Docker proxy is NOT accepted: --skip-docker reports this
#   criterion as FAIL, never as skip/pass.
#
#   platform-app/Dockerfile is built with PLACEHOLDER VITE_* build args — the
#   image must build without real secrets.
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 4 — docker build, both Dockerfiles (real Docker)"
if [ "$SKIP_DOCKER" = "1" ]; then
  fail "criterion 4 cannot pass with --skip-docker — Docker is available; run a real build for sign-off"
else
  # one-time guard: the daemon must actually be reachable
  if ! docker info >/dev/null 2>&1; then
    fail "docker CLI present but the daemon is unreachable — start Docker; criterion 4 needs a live daemon"
  else
    # ---- platform-api image ----
    API_BUILD_LOG=/tmp/ae-hq-c7-docker-api.log
    info "docker build -f $API_DOCKERFILE  (context: repo root, timeout ${DOCKER_BUILD_TIMEOUT}s)…"
    if timeout "$DOCKER_BUILD_TIMEOUT" docker build \
         -f "$REPO_ROOT/$API_DOCKERFILE" \
         -t ae-hq-platform-api:cycle7-verify \
         "$DOCKER_CONTEXT" > "$API_BUILD_LOG" 2>&1; then
      pass "docker build platform-api — image built clean"
    else
      rc=$?
      if [ "$rc" = "124" ]; then
        fail "docker build platform-api TIMED OUT after ${DOCKER_BUILD_TIMEOUT}s — see $API_BUILD_LOG"
      else
        fail "docker build platform-api FAILED (exit $rc) — see $API_BUILD_LOG"
      fi
      info "$(tail -n 8 "$API_BUILD_LOG" 2>/dev/null | sed 's/^/  | /')"
    fi

    # ---- platform-app image (placeholder VITE_* build args) ----
    APP_BUILD_LOG=/tmp/ae-hq-c7-docker-app.log
    info "docker build -f $APP_DOCKERFILE  (placeholder VITE_* build args, timeout ${DOCKER_BUILD_TIMEOUT}s)…"
    if timeout "$DOCKER_BUILD_TIMEOUT" docker build \
         -f "$REPO_ROOT/$APP_DOCKERFILE" \
         --build-arg VITE_SUPABASE_URL="https://verify.placeholder.supabase.co" \
         --build-arg VITE_SUPABASE_PUBLISHABLE_KEY="verify-placeholder-anon-key" \
         --build-arg VITE_API_URL="https://verify-placeholder-api.up.railway.app" \
         -t ae-hq-platform-app:cycle7-verify \
         "$DOCKER_CONTEXT" > "$APP_BUILD_LOG" 2>&1; then
      pass "docker build platform-app — image built clean with placeholder VITE_* args"
    else
      rc=$?
      if [ "$rc" = "124" ]; then
        fail "docker build platform-app TIMED OUT after ${DOCKER_BUILD_TIMEOUT}s — see $APP_BUILD_LOG"
      else
        fail "docker build platform-app FAILED (exit $rc) — see $APP_BUILD_LOG"
      fi
      info "$(tail -n 8 "$APP_BUILD_LOG" 2>/dev/null | sed 's/^/  | /')"
    fi
  fi
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 5 — both railway.json valid JSON with the required keys
#   Required: build.builder == "DOCKERFILE", build.dockerfilePath, and
#   watchPatterns (non-empty array). API additionally needs
#   deploy.healthcheckPath. platform-app's watchPatterns MUST cover the shared
#   workspace packages it consumes (packages/ui, packages/tokens) — otherwise
#   a token/ui change won't trigger a rebuild on Railway.
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 5 — railway.json validity + required keys (both services)"

# json_get <file> <dot.path> — prints the value, or empty on missing/invalid.
json_get() {
  local file="$1" path="$2"
  if [ "$HAVE_JQ" = "1" ]; then
    jq -r "$path // empty" "$file" 2>/dev/null
  else
    bun -e '
      const f=process.argv[1], p=process.argv[2].replace(/^\./,"").split(".");
      let v; try{ v=JSON.parse(require("fs").readFileSync(f,"utf8")); }catch{ process.exit(0); }
      for(const k of p){ if(v==null) break; v=v[k]; }
      if(v==null) process.exit(0);
      process.stdout.write(typeof v==="object"?JSON.stringify(v):String(v));
    ' "$file" "$path" 2>/dev/null
  fi
}
is_valid_json() {
  if [ "$HAVE_JQ" = "1" ]; then jq -e . "$1" >/dev/null 2>&1
  else bun -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$1" >/dev/null 2>&1
  fi
}

check_railway_json() {
  local label="$1" file="$2" want_healthcheck="$3"
  if [ ! -f "$file" ]; then
    fail "$label railway.json missing ($file)"; return
  fi
  if ! is_valid_json "$file"; then
    fail "$label railway.json is not valid JSON"; return
  fi
  local builder dpath watch
  builder="$(json_get "$file" '.build.builder')"
  dpath="$(json_get "$file" '.build.dockerfilePath')"
  watch="$(json_get "$file" '.watchPatterns')"
  local errs=()
  [ "$builder" = "DOCKERFILE" ] || errs+=("build.builder must be \"DOCKERFILE\" (got '${builder:-<missing>}')")
  [ -n "$dpath" ] || errs+=("build.dockerfilePath missing")
  [ -n "$dpath" ] && [ ! -f "$REPO_ROOT/$dpath" ] && errs+=("build.dockerfilePath '$dpath' does not resolve to a file")
  if [ -z "$watch" ] || [ "$watch" = "[]" ] || [ "$watch" = "null" ]; then
    errs+=("watchPatterns missing or empty")
  fi
  if [ "$want_healthcheck" = "yes" ]; then
    local hc; hc="$(json_get "$file" '.deploy.healthcheckPath')"
    [ -n "$hc" ] || errs+=("deploy.healthcheckPath missing (required for the API)")
  fi
  if [ ${#errs[@]} -eq 0 ]; then
    pass "$label railway.json valid — builder/dockerfilePath/watchPatterns$([ "$want_healthcheck" = yes ] && echo /healthcheckPath) OK"
  else
    for e in "${errs[@]}"; do fail "$label railway.json: $e"; done
  fi
}
check_railway_json "platform-api" "$API_RAILWAY_JSON" "yes"
check_railway_json "platform-app" "$APP_RAILWAY_JSON" "no"

# platform-app watchPatterns must cover its workspace deps so a packages/ui or
# packages/tokens change rebuilds the app on Railway.
APP_WATCH="$(json_get "$APP_RAILWAY_JSON" '.watchPatterns')"
if [ -n "$APP_WATCH" ]; then
  miss=()
  echo "$APP_WATCH" | grep -q "packages/ui" || miss+=("packages/ui")
  echo "$APP_WATCH" | grep -q "packages/tokens" || miss+=("packages/tokens")
  if [ ${#miss[@]} -eq 0 ]; then
    pass "platform-app watchPatterns cover its workspace deps (ui, tokens)"
  else
    fail "platform-app watchPatterns miss workspace deps: ${miss[*]} — token/ui changes won't trigger a rebuild"
  fi
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 6 — platform-app/Dockerfile declares the three VITE_* build ARGs
#   Vite bakes VITE_* at BUILD time. Railway passes them as build-time vars
#   only if the Dockerfile has a matching `ARG`. Each of the three must appear
#   as an ARG instruction; each must also be promoted to ENV before the build
#   step (an ARG that is never turned into ENV is invisible to `vite build`).
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 6 — platform-app/Dockerfile declares the VITE_* build ARGs"
APP_DF="$REPO_ROOT/$APP_DOCKERFILE"
if [ ! -f "$APP_DF" ]; then
  fail "platform-app/Dockerfile missing"
else
  vite_vars=(VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY VITE_API_URL)
  missing_arg=()
  missing_env=()
  for v in "${vite_vars[@]}"; do
    grep -Eq "^[[:space:]]*ARG[[:space:]]+$v\b" "$APP_DF" || missing_arg+=("$v")
    grep -Eq "^[[:space:]]*ENV[[:space:]]+$v=" "$APP_DF" || missing_env+=("$v")
  done
  if [ ${#missing_arg[@]} -eq 0 ] && [ ${#missing_env[@]} -eq 0 ]; then
    pass "all three VITE_* vars declared as ARG and promoted to ENV"
  else
    [ ${#missing_arg[@]} -gt 0 ] && fail "platform-app/Dockerfile missing ARG for: ${missing_arg[*]}"
    [ ${#missing_env[@]} -gt 0 ] && fail "platform-app/Dockerfile declares ARG but no ENV for: ${missing_env[*]} (vite build won't see them)"
  fi
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 7 — env-var contract document: every required var, both services,
#   build-time vs runtime, with literal values or a documented Doppler mapping
#
#   The BFF runtime env (apps/platform-api/src/env.ts) requires:
#     AE_SUPABASE_URL, AE_SUPABASE_SERVICE_ROLE_KEY  (+ optional AE_*,
#     ALLOWED_ORIGINS, PORT, APP_ENV)
#   The frontend build env (Vite) requires:
#     VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_API_URL
#   The contract must name all of these and must split build-time vs runtime.
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 7 — env-var contract document completeness"
ENV_DOC=""
for cand in "${ENV_CONTRACT_CANDIDATES[@]}"; do
  [ -f "$cand" ] && { ENV_DOC="$cand"; break; }
done
if [ -z "$ENV_DOC" ]; then
  fail "no env-var contract document found — looked for: ${ENV_CONTRACT_CANDIDATES[*]}"
else
  info "env-var contract: $ENV_DOC"
  required_vars=(
    AE_SUPABASE_URL
    AE_SUPABASE_SERVICE_ROLE_KEY
    ALLOWED_ORIGINS
    VITE_SUPABASE_URL
    VITE_SUPABASE_PUBLISHABLE_KEY
    VITE_API_URL
  )
  missing_vars=()
  for v in "${required_vars[@]}"; do
    grep -q "$v" "$ENV_DOC" || missing_vars+=("$v")
  done
  # must explicitly distinguish build-time vs runtime
  has_split=0
  if grep -Eqi 'build[- ]?time' "$ENV_DOC" && grep -Eqi 'runtime' "$ENV_DOC"; then
    has_split=1
  fi
  # must explain the Doppler key-name mapping (NEXT_PUBLIC_* / Doppler source)
  has_mapping=0
  if grep -Eqi 'doppler|NEXT_PUBLIC_|Railway-provided' "$ENV_DOC"; then
    has_mapping=1
  fi
  if [ ${#missing_vars[@]} -eq 0 ] && [ "$has_split" = "1" ] && [ "$has_mapping" = "1" ]; then
    pass "env-var contract names every required var, splits build/runtime, documents the Doppler mapping"
  else
    [ ${#missing_vars[@]} -gt 0 ] && fail "env-var contract is missing vars: ${missing_vars[*]}"
    [ "$has_split" != "1" ]      && fail "env-var contract does not clearly split build-time vs runtime vars"
    [ "$has_mapping" != "1" ]    && fail "env-var contract does not document the Doppler key mapping / value source"
  fi
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 8 — the Railway dashboard setup guide exists, is substantial, and
#   contains every required section
#
#   Partly qualitative ("a non-expert could follow it") — this check asserts
#   the machine-verifiable floor: the file exists at the directive-mandated
#   path, is non-trivial in length (>= 120 lines AND >= 4000 bytes), and
#   mentions each required topic: project creation, GitHub repo connect, BOTH
#   services by name, env-var entry, the deploy ORDER (the VITE_API_URL
#   chicken-and-egg), the *.up.railway.app URLs, and an OPTIONAL custom-domain
#   section. Numbered/step structure is also required.
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 8 — Railway dashboard guide presence + sections"
if [ ! -f "$GUIDE_DOC" ]; then
  fail "dashboard guide missing — expected $GUIDE_DOC"
else
  g_lines="$(wc -l < "$GUIDE_DOC" | tr -d ' ')"
  g_bytes="$(wc -c < "$GUIDE_DOC" | tr -d ' ')"
  info "guide: $GUIDE_DOC  ($g_lines lines, $g_bytes bytes)"
  size_ok=1
  if [ "$g_lines" -lt 120 ] || [ "$g_bytes" -lt 4000 ]; then
    size_ok=0
    fail "dashboard guide too thin ($g_lines lines / $g_bytes bytes) — needs >=120 lines and >=4000 bytes of click-by-click steps"
  fi
  # required topical sections — each is a case-insensitive content probe
  declare -a SECTION_LABELS=(
    "project creation"
    "GitHub repo connect"
    "platform-api service"
    "platform-app service"
    "environment variables"
    "deploy order"
    "*.up.railway.app URL"
    "optional custom domain"
  )
  declare -a SECTION_REGEX=(
    'create.*project|new project'
    'connect.*repo|github|bencrane/ae-hq'
    'platform-api'
    'platform-app'
    'environment variable|env var|VITE_|AE_SUPABASE'
    'deploy order|deploy.*first|order of deploy|VITE_API_URL'
    'up\.railway\.app'
    'custom domain'
  )
  miss_sections=()
  for i in "${!SECTION_LABELS[@]}"; do
    grep -Eqi "${SECTION_REGEX[$i]}" "$GUIDE_DOC" || miss_sections+=("${SECTION_LABELS[$i]}")
  done
  # the custom-domain section must be marked OPTIONAL
  optional_ok=1
  if grep -Eqi 'custom domain' "$GUIDE_DOC"; then
    grep -Eqi 'optional' "$GUIDE_DOC" || { optional_ok=0; }
  fi
  # numbered / step structure
  structure_ok=0
  if grep -Eq '^[[:space:]]*(#+[[:space:]]*)?(Step[[:space:]]+)?[0-9]+[.\)]' "$GUIDE_DOC"; then
    structure_ok=1
  fi
  if [ "$size_ok" = "1" ] && [ ${#miss_sections[@]} -eq 0 ] && [ "$optional_ok" = "1" ] && [ "$structure_ok" = "1" ]; then
    pass "dashboard guide complete — all 8 sections present, custom-domain marked optional, step-structured"
  else
    [ ${#miss_sections[@]} -gt 0 ] && fail "dashboard guide missing sections: ${miss_sections[*]}"
    [ "$optional_ok" != "1" ]     && fail "dashboard guide has a custom-domain section but it is not marked OPTIONAL"
    [ "$structure_ok" != "1" ]    && fail "dashboard guide is not numbered/step-structured — operator needs ordered steps"
  fi
fi

# ════════════════════════════════════════════════════════════════════════════
# CRITERION 9 — the platform still boots locally (bun run dev), no regression
#   Boots `bun run dev` (concurrently runs platform-api + platform-app) and
#   waits for the API /healthz and the app root to both return 200.
# ════════════════════════════════════════════════════════════════════════════
step "Criterion 9 — bun run dev boots clean (no regression)"
if [ "$SKIP_DEV" = "1" ]; then
  fail "criterion 9 cannot pass with --skip-dev — boot the platform for sign-off"
else
  DEV_LOG=/tmp/ae-hq-c7-dev.log
  ( cd "$REPO_ROOT" && bun run dev > "$DEV_LOG" 2>&1 & echo $! > /tmp/ae-hq-c7-dev.pid )
  DEV_PID="$(cat /tmp/ae-hq-c7-dev.pid 2>/dev/null || echo '')"
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
  app_code=000
  api_code=000
  for _ in $(seq 1 60); do
    app_code="$(http_status "$APP_URL/")"
    api_code="$(http_status "$API_URL/healthz")"
    if [ "$app_code" = "200" ] && [ "$api_code" = "200" ]; then dev_up=1; break; fi
    sleep 1
  done
  if [ "$dev_up" = "1" ]; then
    pass "bun run dev booted — app ($APP_URL) and api ($API_URL/healthz) both 200"
  else
    fail "bun run dev failed to boot (app=$app_code api=$api_code) — see $DEV_LOG"
    info "$(tail -n 8 "$DEV_LOG" 2>/dev/null | sed 's/^/  | /')"
  fi
  cleanup_dev
  trap - EXIT
fi

# ════════════════════════════════════════════════════════════════════════════
# summary
# ════════════════════════════════════════════════════════════════════════════
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
green "  All 9 success criteria pass. Cycle ae-hq-railway-deploy-prep complete."
exit 0
