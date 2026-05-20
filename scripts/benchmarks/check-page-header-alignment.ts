#!/usr/bin/env tsx
/**
 * check-page-header-alignment.ts
 *
 * Criterion 11 verifier.
 *
 * Boots a Playwright Chromium at 1280×720, signs in as the seeded
 * candidate, navigates every authed route, queries the
 * `[data-page-header-eyebrow]` (or `[data-testid="page-header-eyebrow"]`)
 * bounding box, and asserts that the (x, y) of EVERY route's eyebrow is
 * within ±2 pixels of the `/me` baseline.
 *
 * For company routes, signs in as the seeded recruiter and uses the same
 * baseline (eyebrows should align across shells too).
 *
 * The eyebrow is the route-identity strip rendered by `<PageHeader>` (e.g.
 * "01 // PROFILE"). The Page primitive owns its position; this test catches
 * any route that ever escapes the Page wrapper.
 *
 * Required env:
 *   APP_URL                     (default http://localhost:5173)
 *   TEST_CANDIDATE_EMAIL        (default candidate1@accountexecutive.test)
 *   TEST_RECRUITER_EMAIL        (default recruiter1@stripe.test)
 *   TEST_PASSWORD               (default testing123!)
 *
 * Exit codes:
 *   0 — every route's eyebrow within ±2 px of /me baseline
 *   1 — at least one route drifted
 *   2 — missing eyebrow on a route (PageHeader not rendered or not tagged)
 */

import { chromium, type Page } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:5173";
const CAND_EMAIL = process.env.TEST_CANDIDATE_EMAIL ?? "candidate1@accountexecutive.test";
const REC_EMAIL  = process.env.TEST_RECRUITER_EMAIL ?? "recruiter1@stripe.test";
const PASSWORD   = process.env.TEST_PASSWORD ?? "testing123!";

const TOLERANCE = 2; // pixels

const EYEBROW_SELECTOR =
  '[data-page-header-eyebrow], [data-testid="page-header-eyebrow"]';

const CANDIDATE_ROUTES = [
  "/me",
  "/me/profile",
  "/me/intent",
  "/me/credentials",
  "/me/approvals",
];

const COMPANY_ROUTES = [
  "/co",
  "/co/candidates",
  "/co/company",
  "/co/ats",
  "/co/billing",
];

async function signIn(page: Page, email: string) {
  await page.goto(`${APP_URL}/signin`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !/\/signin$/.test(url.pathname), { timeout: 15_000 }),
    page.click('button[type="submit"]'),
  ]);
}

interface Probe {
  route: string;
  x: number;
  y: number;
}

async function probeRoute(page: Page, route: string): Promise<Probe> {
  await page.goto(`${APP_URL}${route}`, { waitUntil: "networkidle" });
  const handle = await page.waitForSelector(EYEBROW_SELECTOR, {
    state: "visible",
    timeout: 10_000,
  });
  const box = await handle.boundingBox();
  if (!box) throw new Error(`no bounding box for eyebrow on ${route}`);
  return { route, x: box.x, y: box.y };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();

  try {
    await signIn(page, CAND_EMAIL);
  } catch (err) {
    console.error(`could not sign in as candidate: ${err}`);
    await browser.close();
    process.exit(2);
  }

  const probes: Probe[] = [];
  try {
    for (const r of CANDIDATE_ROUTES) {
      probes.push(await probeRoute(page, r));
    }
  } catch (err) {
    console.error(`missing eyebrow on candidate route: ${err}`);
    await browser.close();
    process.exit(2);
  }

  // Sign out + sign in as recruiter for company routes.
  await ctx.clearCookies();
  await page.goto(`${APP_URL}/signin`, { waitUntil: "networkidle" });
  try {
    await signIn(page, REC_EMAIL);
  } catch (err) {
    console.error(`could not sign in as recruiter: ${err}`);
    await browser.close();
    process.exit(2);
  }
  try {
    for (const r of COMPANY_ROUTES) {
      probes.push(await probeRoute(page, r));
    }
  } catch (err) {
    console.error(`missing eyebrow on company route: ${err}`);
    await browser.close();
    process.exit(2);
  }

  await browser.close();

  const baseline = probes.find((p) => p.route === "/me");
  if (!baseline) {
    console.error("no /me baseline probe");
    process.exit(2);
  }

  let drifted = 0;
  console.log(`Baseline /me: x=${baseline.x.toFixed(1)} y=${baseline.y.toFixed(1)}`);
  for (const p of probes) {
    const dx = p.x - baseline.x;
    const dy = p.y - baseline.y;
    const ok = Math.abs(dx) <= TOLERANCE && Math.abs(dy) <= TOLERANCE;
    const marker = ok ? "OK  " : "FAIL";
    console.log(`  ${marker} ${p.route.padEnd(22)} x=${p.x.toFixed(1)} y=${p.y.toFixed(1)} Δx=${dx.toFixed(1)} Δy=${dy.toFixed(1)}`);
    if (!ok) drifted++;
  }
  if (drifted > 0) {
    console.error(`\n${drifted} route(s) drifted beyond ±${TOLERANCE}px`);
    process.exit(1);
  }
  console.log(`\nAll ${probes.length} authed routes aligned within ±${TOLERANCE}px`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
