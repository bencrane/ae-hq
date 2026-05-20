#!/usr/bin/env tsx
/**
 * check-primitive-stories.ts
 *
 * Criterion 5 verifier.
 *
 * Walks `packages/ui/src/**\/*.tsx` (excluding `.stories.tsx` and
 * `.test.tsx`), parses each, collects every **exported PascalCase
 * function or const component**, then walks
 * `packages/ui/src/**\/*.stories.tsx` and asserts each exported component
 * has at least one story (either default-export `meta.component` matches,
 * OR a named export ending in `Story`/`Default`/`Basic` references it).
 *
 * The check is intentionally tolerant: a component is "covered" if any
 * `.stories.tsx` file mentions its identifier as a JSX tag.
 *
 * Exit codes:
 *   0 — every exported primitive has ≥1 story
 *   1 — at least one primitive missing
 *   2 — packages/ui/src missing
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import * as ts from "typescript";

const REPO_ROOT = resolve(__dirname, "..", "..");
const UI_SRC = join(REPO_ROOT, "packages/ui/src");

if (!existsSync(UI_SRC)) {
  console.error(`missing ${UI_SRC}`);
  process.exit(2);
}

function walk(dir: string, suffix: string, exclude: string[] = []): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p, suffix, exclude));
    else if (name.endsWith(suffix) && !exclude.some((x) => name.endsWith(x))) out.push(p);
  }
  return out;
}

function extractExportedComponents(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const names: string[] = [];

  function isPascal(s: string): boolean {
    return /^[A-Z][A-Za-z0-9]*$/.test(s);
  }

  function hasExportModifier(node: ts.Node): boolean {
    const mods = (ts as unknown as { canHaveModifiers?: (n: ts.Node) => boolean; getModifiers?: (n: ts.Node) => readonly ts.Modifier[] | undefined }).getModifiers
      ? (ts as unknown as { getModifiers: (n: ts.Node) => readonly ts.Modifier[] | undefined }).getModifiers(node)
      : undefined;
    if (mods) return mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    // Fallback to legacy `node.modifiers` for older TS versions.
    const legacy = (node as unknown as { modifiers?: readonly ts.Modifier[] }).modifiers;
    return !!legacy?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  }

  source.forEachChild((node) => {
    if (ts.isFunctionDeclaration(node) && hasExportModifier(node) && node.name && isPascal(node.name.text)) {
      names.push(node.name.text);
    } else if (ts.isVariableStatement(node) && hasExportModifier(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && isPascal(decl.name.text)) {
          names.push(decl.name.text);
        }
      }
    } else if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const el of node.exportClause.elements) {
        if (isPascal(el.name.text)) names.push(el.name.text);
      }
    }
  });

  return Array.from(new Set(names));
}

function main() {
  const compFiles = walk(UI_SRC, ".tsx", [".stories.tsx", ".test.tsx", ".spec.tsx"]);
  const storyFiles = walk(UI_SRC, ".stories.tsx");

  const exported = new Map<string, string>(); // name → file
  for (const f of compFiles) {
    for (const name of extractExportedComponents(f)) {
      if (!exported.has(name)) exported.set(name, f);
    }
  }

  if (exported.size === 0) {
    console.error("no exported primitives found in packages/ui/src — did you forget to write any?");
    process.exit(1);
  }

  // Concatenate all story-file source as text and look for JSX-usage of each
  // primitive name. A primitive is "covered" if its identifier appears as
  // a JSX tag in any story file.
  const storyText = storyFiles.map((f) => readFileSync(f, "utf8")).join("\n");

  const missing: string[] = [];
  for (const [name, file] of exported) {
    // Heuristic: `<Name` or `component: Name` (Storybook CSF) — both count.
    const tagRe = new RegExp(`<${name}\\b`);
    const metaRe = new RegExp(`component:\\s*${name}\\b`);
    if (!tagRe.test(storyText) && !metaRe.test(storyText)) {
      missing.push(`${name}  (defined in ${file.replace(REPO_ROOT + "/", "")})`);
    }
  }

  console.log(`Exported primitives: ${exported.size}`);
  console.log(`Story files: ${storyFiles.length}`);
  if (missing.length > 0) {
    console.error(`\nFAIL: ${missing.length} primitive(s) without a story:`);
    for (const m of missing) console.error(`  - ${m}`);
    process.exit(1);
  }
  console.log("OK: every exported primitive has at least one story");
  process.exit(0);
}

main();
