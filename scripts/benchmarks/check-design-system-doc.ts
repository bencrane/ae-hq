#!/usr/bin/env tsx
/**
 * check-design-system-doc.ts
 *
 * Criterion 12 verifier (companion to the bash grep).
 *
 * Asserts that `docs/design-system.md` lists every exported primitive from
 * `packages/ui/src/**\/*.tsx`. The check is name-based: each primitive
 * identifier must appear in the markdown as a backtick-wrapped reference
 * (e.g. `` `<Stack>` `` or `` `Stack` ``) at least once.
 *
 * Exit codes:
 *   0 — every exported primitive is documented
 *   1 — one or more primitives missing
 *   2 — file or directory missing
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import * as ts from "typescript";

const REPO_ROOT = resolve(__dirname, "..", "..");
const UI_SRC = join(REPO_ROOT, "packages/ui/src");
const DOC = join(REPO_ROOT, "docs/design-system.md");

if (!existsSync(UI_SRC)) { console.error(`missing ${UI_SRC}`); process.exit(2); }
if (!existsSync(DOC))    { console.error(`missing ${DOC}`); process.exit(2); }

function walk(dir: string, suffix: string, exclude: string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p, suffix, exclude));
    else if (name.endsWith(suffix) && !exclude.some((x) => name.endsWith(x))) out.push(p);
  }
  return out;
}

function extractExports(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const names: string[] = [];
  const isPascal = (s: string) => /^[A-Z][A-Za-z0-9]*$/.test(s);
  source.forEachChild((node) => {
    const legacy = (node as unknown as { modifiers?: readonly ts.Modifier[] }).modifiers;
    const exported = !!legacy?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (ts.isFunctionDeclaration(node) && exported && node.name && isPascal(node.name.text)) {
      names.push(node.name.text);
    } else if (ts.isVariableStatement(node) && exported) {
      for (const d of node.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && isPascal(d.name.text)) names.push(d.name.text);
      }
    }
  });
  return Array.from(new Set(names));
}

const files = walk(UI_SRC, ".tsx", [".stories.tsx", ".test.tsx", ".spec.tsx"]);
const all = new Set<string>();
for (const f of files) for (const n of extractExports(f)) all.add(n);

const doc = readFileSync(DOC, "utf8");
const missing: string[] = [];
for (const name of all) {
  const a = new RegExp("`<" + name + "[\\s>/]");
  const b = new RegExp("`" + name + "`");
  if (!a.test(doc) && !b.test(doc)) missing.push(name);
}

if (missing.length > 0) {
  console.error(`FAIL: ${missing.length} primitive(s) not documented in docs/design-system.md:`);
  for (const m of missing) console.error(`  - ${m}`);
  process.exit(1);
}
console.log(`OK: all ${all.size} primitives documented`);
process.exit(0);
