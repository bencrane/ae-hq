#!/usr/bin/env tsx
/**
 * check-no-route-geometry.ts
 *
 * Criterion 10 verifier.
 *
 * Walks every `apps/platform-app/src/routes/**\/*.tsx` file, parses it with
 * the TypeScript compiler API, finds the **default-exported / named-exported
 * route component function**, walks to its **top-level returned JSX element**,
 * and asserts that the `className` literal does NOT contain any banned tokens:
 *
 *   - `mx-auto`
 *   - `max-w-…` (any modifier)
 *   - `px-N`, `px-N.5`        (raw padding utilities — banned at top level)
 *   - `py-N`, `py-N.5`
 *   - `gap-N`                 (gap belongs to Stack/Inline primitives)
 *
 * The check is intentionally *top-level only*: the `<Page>` primitive may
 * internally use any class; we only assert that route files describe content,
 * not geometry.
 *
 * Escape hatch: a route may use `unsafe_className="…"` on the top-level
 * `<Page>` element — this is allowed (the prop name signals intent and the
 * `no-route-geometry` ESLint rule blocks it from sneaking into PRs).
 *
 * Exit codes:
 *   0 — no banned classes anywhere
 *   1 — at least one route has banned top-level geometry
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import * as ts from "typescript";

const REPO_ROOT = resolve(__dirname, "..", "..");
const ROUTES_DIR = join(REPO_ROOT, "apps/platform-app/src/routes");

const BANNED = [
  /\bmx-auto\b/,
  /\bmax-w-[a-z0-9.\/]+/,
  /\bpx-[0-9]+(?:\.[0-9]+)?\b/,
  /\bpy-[0-9]+(?:\.[0-9]+)?\b/,
  /\bgap-[0-9]+(?:\.[0-9]+)?\b/,
];

function walkTsx(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      out.push(...walkTsx(p));
    } else if (name.endsWith(".tsx")) {
      out.push(p);
    }
  }
  return out;
}

interface Finding {
  file: string;
  line: number;
  classes: string;
  hits: string[];
}

function extractClassNameOfTopLevelReturn(
  source: ts.SourceFile,
  file: string,
): Finding[] {
  const findings: Finding[] = [];

  // Find all top-level function declarations + variable statements that look
  // like a React component (PascalCase identifier returning JSX).
  function visitTopLevel(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name && /^[A-Z]/.test(node.name.text)) {
      checkBody(node.body, file, source, findings);
    } else if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          /^[A-Z]/.test(decl.name.text) &&
          decl.initializer &&
          (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
        ) {
          const body = decl.initializer.body;
          if (ts.isBlock(body)) {
            checkBody(body, file, source, findings);
          } else if (ts.isJsxElement(body) || ts.isJsxSelfClosingElement(body) || ts.isJsxFragment(body)) {
            // Direct-return arrow: () => <div ... />
            checkJsxElement(body, file, source, findings);
          }
        }
      }
    }
  }

  source.forEachChild(visitTopLevel);
  return findings;
}

function checkBody(
  body: ts.Block | undefined,
  file: string,
  source: ts.SourceFile,
  findings: Finding[],
) {
  if (!body) return;
  // Find every top-level `return <JSX />` statement in the function body.
  // (We don't recurse into nested function declarations — those are sub-components.)
  for (const stmt of body.statements) {
    if (ts.isReturnStatement(stmt) && stmt.expression) {
      const expr = unwrapParens(stmt.expression);
      if (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr) || ts.isJsxFragment(expr)) {
        checkJsxElement(expr, file, source, findings);
      }
    } else if (ts.isIfStatement(stmt)) {
      // Early-return guards (`if (loading) return <... />`) — check those too.
      walkForReturns(stmt, file, source, findings);
    }
  }
}

function walkForReturns(
  node: ts.Node,
  file: string,
  source: ts.SourceFile,
  findings: Finding[],
) {
  node.forEachChild((child) => {
    if (ts.isReturnStatement(child) && child.expression) {
      const expr = unwrapParens(child.expression);
      if (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr) || ts.isJsxFragment(expr)) {
        checkJsxElement(expr, file, source, findings);
      }
    } else if (!ts.isFunctionDeclaration(child) && !ts.isArrowFunction(child) && !ts.isFunctionExpression(child)) {
      walkForReturns(child, file, source, findings);
    }
  });
}

function unwrapParens(expr: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(expr)) expr = expr.expression;
  return expr;
}

function checkJsxElement(
  node: ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment,
  file: string,
  source: ts.SourceFile,
  findings: Finding[],
) {
  if (ts.isJsxFragment(node)) {
    // A fragment as the top-level return is fine — fragments have no
    // className. But if its first child element has banned geometry, that's
    // also a top-level violation.
    for (const child of node.children) {
      if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
        checkSingleElement(child, file, source, findings);
        break; // only the first content element counts as "top-level"
      }
    }
    return;
  }
  checkSingleElement(node, file, source, findings);
}

function checkSingleElement(
  node: ts.JsxElement | ts.JsxSelfClosingElement,
  file: string,
  source: ts.SourceFile,
  findings: Finding[],
) {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  // Skip the `<Page>` primitive — that's the whole point of the design system.
  const tag = opening.tagName.getText(source);
  if (tag === "Page" || tag === "PublicPage" || tag === "AuthPage") return;
  // Find a `className` attribute (or `unsafe_className` — those are exempt).
  for (const attr of opening.attributes.properties) {
    if (!ts.isJsxAttribute(attr)) continue;
    if (!ts.isIdentifier(attr.name)) continue;
    const name = attr.name.text;
    if (name === "unsafe_className") return; // explicit escape hatch
    if (name !== "className") continue;
    const init = attr.initializer;
    if (!init || !ts.isStringLiteral(init)) continue;
    const classes = init.text;
    const hits: string[] = [];
    for (const pat of BANNED) {
      const m = classes.match(pat);
      if (m) hits.push(m[0]);
    }
    if (hits.length > 0) {
      const { line } = source.getLineAndCharacterOfPosition(opening.getStart(source));
      findings.push({ file, line: line + 1, classes, hits });
    }
  }
}

function main() {
  const files = walkTsx(ROUTES_DIR);
  if (files.length === 0) {
    console.error(`No .tsx files under ${ROUTES_DIR}`);
    process.exit(1);
  }
  const allFindings: Finding[] = [];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    const source = ts.createSourceFile(f, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
    allFindings.push(...extractClassNameOfTopLevelReturn(source, f));
  }
  if (allFindings.length === 0) {
    console.log(`OK: ${files.length} route files scanned, 0 top-level geometry violations`);
    process.exit(0);
  }
  console.error(`FAIL: ${allFindings.length} top-level geometry violation(s):`);
  for (const f of allFindings) {
    const rel = f.file.replace(REPO_ROOT + "/", "");
    console.error(`  ${rel}:${f.line}  banned=[${f.hits.join(", ")}]`);
    console.error(`    className="${f.classes}"`);
  }
  process.exit(1);
}

main();
