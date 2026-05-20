#!/usr/bin/env tsx
/**
 * check-storybook-a11y.ts
 *
 * Criterion 8 verifier.
 *
 * Boots Storybook in dev mode (or expects an already-running instance at
 * STORYBOOK_URL), enumerates every registered story via Storybook's
 * `/index.json`, navigates each iframe URL with Playwright, injects
 * `axe-core`, and asserts zero violations.
 *
 * The script will start Storybook itself if not reachable, kill it on
 * exit. If `STORYBOOK_URL` is already 200, we reuse the running server.
 *
 * Required env:
 *   STORYBOOK_URL   (default http://localhost:6006)
 *
 * Exit codes:
 *   0 — zero a11y violations across all stories
 *   1 — at least one story produced violations
 *   2 — Storybook unreachable / couldn't enumerate stories
 */

import { chromium } from "playwright";
import { spawn, type ChildProcess } from "node:child_process";

const STORYBOOK_URL = process.env.STORYBOOK_URL ?? "http://localhost:6006";

const AXE_SOURCE_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.0/axe.min.js";

async function fetchOk(url: string, timeoutMs = 5000): Promise<boolean> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    const res = await fetch(url, { signal: ac.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitFor(url: string, attempts: number): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (await fetchOk(url, 2000)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

interface StoryEntry {
  id: string;
  title: string;
  name: string;
  type?: string;
}

async function listStories(): Promise<StoryEntry[]> {
  const res = await fetch(`${STORYBOOK_URL}/index.json`);
  if (!res.ok) throw new Error(`GET /index.json → ${res.status}`);
  const data = (await res.json()) as { entries?: Record<string, StoryEntry> };
  if (!data.entries) throw new Error("no entries in /index.json");
  return Object.values(data.entries).filter((e) => e.type === "story" || e.type === undefined);
}

async function main() {
  let proc: ChildProcess | null = null;
  if (!(await fetchOk(`${STORYBOOK_URL}/`))) {
    console.log(`Storybook not running at ${STORYBOOK_URL} — spawning…`);
    proc = spawn("bun", ["run", "storybook"], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });
    proc.stdout?.on("data", () => {});
    proc.stderr?.on("data", () => {});
    if (!(await waitFor(`${STORYBOOK_URL}/`, 90))) {
      proc.kill("SIGTERM");
      console.error("Storybook failed to boot within 90s");
      process.exit(2);
    }
  }

  let stories: StoryEntry[] = [];
  try {
    stories = await listStories();
  } catch (err) {
    console.error(`could not enumerate stories: ${err}`);
    if (proc) proc.kill("SIGTERM");
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();

  let totalViolations = 0;
  const failures: { story: string; count: number; summary: string }[] = [];

  for (const story of stories) {
    const url = `${STORYBOOK_URL}/iframe.html?id=${story.id}&viewMode=story`;
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
      await page.addScriptTag({ url: AXE_SOURCE_URL });
      const result = await page.evaluate(async () => {
        // Storybook renders each component in ISOLATION inside an iframe.
        // Three axe rules are page-document-structure rules that can never
        // pass for an isolated component and are not component defects:
        //   - landmark-one-main   (a page should have one <main>)
        //   - page-has-heading-one(a page should have an <h1>)
        //   - region              (all content should sit inside a landmark)
        // We disable exactly those three. Every component-level rule
        // (color-contrast, ARIA names/required-attrs, labels, roles,
        // keyboard) stays fully enforced.
        // @ts-expect-error – axe is injected at runtime
        const r = await window.axe.run(document, {
          resultTypes: ["violations"],
          rules: {
            "color-contrast": { enabled: true },
            "landmark-one-main": { enabled: false },
            "page-has-heading-one": { enabled: false },
            region: { enabled: false },
          },
        });
        return {
          violations: r.violations.length,
          summary: r.violations
            .map((v: { id: string; nodes: unknown[] }) => `${v.id}×${v.nodes.length}`)
            .join(", "),
        };
      });
      if (result.violations > 0) {
        totalViolations += result.violations;
        failures.push({ story: `${story.title}/${story.name}`, count: result.violations, summary: result.summary });
        console.log(`  FAIL ${story.title}/${story.name} — ${result.violations} violation(s): ${result.summary}`);
      } else {
        console.log(`  OK   ${story.title}/${story.name}`);
      }
    } catch (err) {
      failures.push({ story: `${story.title}/${story.name}`, count: 0, summary: `nav error: ${err}` });
      console.log(`  ERR  ${story.title}/${story.name} — ${err}`);
    }
  }

  await browser.close();
  if (proc) proc.kill("SIGTERM");

  console.log(`\nScanned ${stories.length} stories; ${failures.length} failed.`);
  if (failures.length > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
