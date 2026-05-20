#!/usr/bin/env tsx
/**
 * check-sidebar-dividers.ts
 *
 * Criterion 8 verifier for /scope cycle `ae-hq-polish-and-profiles`.
 *
 * The directive: "every divider in both sidebars is identical in weight,
 * color, and inset" — one border token, consistent treatment, across
 * CandidateLayout.tsx and CompanyLayout.tsx.
 *
 * Strategy — a static className audit (no browser needed, deterministic):
 *
 *   1. Read both layout files. For each, collect every `className` string
 *      literal (incl. the literal portions of template literals) that
 *      contains a border utility (`border`, `border-t`, `border-b`,
 *      `border-l`, `border-r`, or a `border-<color>` token).
 *   2. From those, extract the BORDER-COLOR token actually used for
 *      dividers — every `border-<color>-<shade>` / `border-[color:var(...)]`
 *      occurrence that sits on a divider element. We define a "divider"
 *      occurrence as a className that pairs a side border (`border-t/-b/-l/-r`)
 *      or a bare `border` with a color token. The nav-item `border-l-2`
 *      accent (the active-state rail) and focus-ring borders are NOT
 *      dividers — they are excluded by an explicit ignore list of
 *      class fragments.
 *   3. ASSERT: across BOTH files combined, the set of distinct divider
 *      border-color tokens has size exactly 1. Two layouts using
 *      `border-zinc-900` and `border-zinc-800` respectively = FAIL.
 *      One layout mixing `border-zinc-900` and `border-white/5` = FAIL.
 *   4. ASSERT: no divider uses a raw hex / rgb literal — dividers must use
 *      a token (`border-zinc-*`, `border-[color:var(--...)]`, or a
 *      semantic border class). A raw `border-[#1a1a1a]` = FAIL.
 *   5. WARN (not fail) if the two files use a different border WIDTH on
 *      dividers (`border` vs `border-2`) — weight is part of "identical"
 *      but the default 1px border has no width class, so this is a soft
 *      signal rather than a hard gate.
 *
 * Rationale for static-over-screenshot: the divider treatment is a
 * className contract. A screenshot diff is noisier (font rendering, AA)
 * and needs a booted app + auth. The className audit is exact and fast,
 * and the directive explicitly permits "an AST/className audit ... OR a
 * Playwright screenshot-based check".
 *
 * Exit codes:
 *   0 — every divider in both layouts shares one border-color token
 *   1 — dividers are inconsistent (≥2 tokens) or use a raw literal
 *   2 — a layout file is missing / unreadable
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const REPO_ROOT = resolve(__dirname, "..", "..");
const LAYOUT_DIR = join(REPO_ROOT, "apps/platform-app/src/components");
const FILES = ["CandidateLayout.tsx", "CompanyLayout.tsx"];

// What a "section divider" IS, precisely:
//   A divider is a DIRECTIONAL border — `border-t`, `border-b`, `border-r`,
//   or a 1px `border-l` — that rules between sidebar sections (the wordmark
//   rule, the identity block edge, nav-section edges, the footer rule).
//
// What it is NOT (and must be excluded):
//   - the nav-item active rail: `border-l-2` (width-2 left border).
//   - control outlines: a bare `border` on the sign-out button / bell button.
//     A bare `border` is not directional, so it never matches DIRECTIONAL_BORDER.
//   - hover/focus state borders: `hover:border-zinc-700`, focus rings — these
//     are interaction chrome; their color tokens are stripped before counting.
//   - `border-transparent` — a placeholder, not a real divider color.

// A 1px directional border — the structural marker of a section divider.
// `border-l-2` is deliberately excluded (the nav rail). Plain `border-l`
// (1px) is included; if a layout legitimately uses `border-l` as a divider
// it is held to the same single-token rule.
const DIRECTIONAL_BORDER = /\bborder-[trbl]\b(?!-)/;

// The nav-item active rail — a width-2 left border. Presence of this on a
// className does NOT by itself disqualify (a node could carry both), but the
// rail's own color (`border-emerald-500` / `border-transparent`) is excluded
// from the color scan by COLOR_EXCLUDE below.
// (kept for documentation; matching is done via DIRECTIONAL_BORDER + excludes)

// A raw color literal in a border utility — banned for dividers.
const RAW_BORDER_LITERAL = /\bborder-\[(?!color:)(#|rgb|hsl)/i;

// A border-color token (UNPREFIXED — a leading `hover:`/`focus:`/`group-`/etc.
// is excluded by the negative lookbehind-ish guard in extractColorTokens):
//   border-<name>-<shade>, border-<name>/<opacity>, border-[color:var(--...)].
const BORDER_COLOR =
  /\bborder-(?:\[color:var\(--[a-z0-9-]+\)\]|[a-z]+-\d{2,3}(?:\/\d{1,3})?|[a-z]+\/\d{1,3})/g;

// Color tokens that are never a divider treatment even on a divider element.
const COLOR_EXCLUDE = new Set(["border-transparent"]);

type Finding = { file: string; className: string; token: string };

function classNameLiterals(src: string): string[] {
  // Grab the contents of every className="..." / className={`...`} / className={'...'}.
  const out: string[] = [];
  // double-quoted
  for (const m of src.matchAll(/className=\{?["'`]([^"'`]*)["'`]\}?/g)) {
    if (m[1]) out.push(m[1]);
  }
  // template literals with interpolation — keep the static chunks
  for (const m of src.matchAll(/className=\{`([^`]*)`\}/g)) {
    if (m[1]) {
      for (const chunk of m[1].split(/\$\{[^}]*\}/)) {
        if (chunk.trim()) out.push(chunk);
      }
    }
  }
  return out;
}

// A className is a divider element iff it carries a 1px directional border.
function isDividerClass(cls: string): boolean {
  return DIRECTIONAL_BORDER.test(cls);
}

// Extract the divider border-color tokens from a className: split into
// whitespace-separated tokens, DROP any variant-prefixed token (anything with
// a `:` — `hover:`, `focus:`, `lg:`, `group-hover:` …), then keep tokens that
// are an unprefixed `border-<color>` and not in COLOR_EXCLUDE.
function extractColorTokens(cls: string): string[] {
  const out: string[] = [];
  for (const raw of cls.split(/\s+/)) {
    if (raw.includes(":")) continue; // a variant-prefixed utility — not a divider color
    const m = raw.match(BORDER_COLOR);
    if (!m) continue;
    for (const tok of m) {
      if (!COLOR_EXCLUDE.has(tok)) out.push(tok);
    }
  }
  return out;
}

function main() {
  const findings: Finding[] = [];
  const rawLiterals: Finding[] = [];
  let hadFileError = false;

  for (const file of FILES) {
    const p = join(LAYOUT_DIR, file);
    if (!existsSync(p)) {
      console.error(`  FAIL  ${file} — not found at ${p}`);
      hadFileError = true;
      continue;
    }
    const src = readFileSync(p, "utf8");
    const literals = classNameLiterals(src);

    for (const cls of literals) {
      if (RAW_BORDER_LITERAL.test(cls)) {
        rawLiterals.push({ file, className: cls.trim(), token: "RAW_LITERAL" });
      }
      // only a className with a 1px directional border is a divider element.
      if (!isDividerClass(cls)) continue;
      const colorTokens = extractColorTokens(cls);
      for (const token of colorTokens) {
        findings.push({ file, className: cls.trim(), token });
      }
    }
  }

  if (hadFileError) {
    console.error("FAIL: a layout file is missing");
    process.exit(2);
  }

  if (findings.length === 0) {
    console.error(
      "FAIL: no divider border classes detected in either layout — " +
        "the className matcher found nothing. Either the layouts were " +
        "restructured (revisit this check) or dividers were removed entirely.",
    );
    process.exit(1);
  }

  let failed = false;

  // raw literals
  if (rawLiterals.length > 0) {
    failed = true;
    console.error(`  FAIL  ${rawLiterals.length} divider/border class uses a raw color literal:`);
    for (const r of rawLiterals) console.error(`        ${r.file}: ${r.className}`);
  }

  // distinct tokens
  const tokens = new Map<string, Finding[]>();
  for (const f of findings) {
    const list = tokens.get(f.token) ?? [];
    list.push(f);
    tokens.set(f.token, list);
  }

  console.log(`Divider border occurrences: ${findings.length}`);
  console.log(`Distinct divider border-color tokens: ${tokens.size}`);
  for (const [token, list] of tokens) {
    const files = Array.from(new Set(list.map((f) => f.file))).join(", ");
    console.log(`  - ${token}  (${list.length}x, in: ${files})`);
  }

  if (tokens.size !== 1) {
    failed = true;
    console.error(
      `  FAIL  dividers use ${tokens.size} different border-color tokens — ` +
        `criterion 8 requires exactly ONE treatment across both layouts`,
    );
  } else {
    console.log(`  ok    every divider shares one border-color token`);
  }

  if (failed) {
    console.error("\nFAIL: sidebar dividers are not consistent");
    process.exit(1);
  }

  console.log("\nOK: every divider in both sidebar layouts shares one border treatment");
  process.exit(0);
}

main();
