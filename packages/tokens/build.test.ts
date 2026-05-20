import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIST = join(import.meta.dir, "dist");

test("tokens.css is emitted", () => {
  expect(existsSync(join(DIST, "css", "tokens.css"))).toBe(true);
});

test("tokens.css contains @theme block", () => {
  const css = readFileSync(join(DIST, "css", "tokens.css"), "utf8");
  expect(css).toContain("@theme {");
});

test("tokens.css contains spacing tokens", () => {
  const css = readFileSync(join(DIST, "css", "tokens.css"), "utf8");
  expect(css).toContain("--spacing-4: 1rem");
  expect(css).toContain("--spacing-12: 3rem");
});

test("tokens.css contains color tokens", () => {
  const css = readFileSync(join(DIST, "css", "tokens.css"), "utf8");
  expect(css).toContain("--color-surface-base: #09090b");
  expect(css).toContain("--color-accent-primary: #10b981");
});

test("tokens.css contains font-size tokens with line-height", () => {
  const css = readFileSync(join(DIST, "css", "tokens.css"), "utf8");
  expect(css).toContain("--text-body-md: 1rem");
  expect(css).toContain("--text-body-md--line-height: 1.5rem");
});

test("tokens.css contains motion + z + page-width tokens", () => {
  const css = readFileSync(join(DIST, "css", "tokens.css"), "utf8");
  expect(css).toContain("--motion-duration-base: 200ms");
  expect(css).toContain("--z-modal: 50");
  expect(css).toContain("--page-width-default: 72rem");
});

test("tailwind preset is emitted", () => {
  expect(existsSync(join(DIST, "tailwind", "preset.js"))).toBe(true);
  expect(existsSync(join(DIST, "tailwind", "preset.ts"))).toBe(true);
  expect(existsSync(join(DIST, "tailwind", "preset.d.ts"))).toBe(true);
});

test("ts index is compiled", () => {
  expect(existsSync(join(DIST, "ts", "index.js"))).toBe(true);
  expect(existsSync(join(DIST, "ts", "index.d.ts"))).toBe(true);
});
