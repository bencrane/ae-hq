#!/usr/bin/env tsx
/**
 * check-company-jobs.ts
 *
 * Criterion 12 verifier for cycle `ae-hq-jobs-as-objects`.
 *
 * Browser check (Playwright) over the company jobs overview / aggregate
 * dashboard. Signs in as the seeded recruiter and asserts `/co/jobs`:
 *
 *   1. renders inside the portal shell (aside[data-testid="portal-sidebar"]).
 *   2. lists >= 1 job-posting row (`[data-testid="co-job-row"]`). Stripe is
 *      seeded with >= 4 postings, so a correct page shows several.
 *   3. EVERY posting row carries an applicant count
 *      (`[data-testid="co-job-applicant-count"]`) whose text contains a
 *      digit — a posting must show how many applicants it has, even if 0.
 *   4. EVERY posting row carries a funnel summary
 *      (`[data-testid="co-job-funnel"]`) — the compact per-stage breakdown.
 *   5. each posting row links to its per-job pipeline `/co/jobs/:id`
 *      (an `a[href^="/co/jobs/"]` inside the row) — the directive says the
 *      overview is the entry point to each per-job board.
 *
 * Required env:
 *   APP_URL (default http://localhost:5173)
 *   TEST_RECRUITER_EMAIL (default recruiter1@stripe.test), TEST_PASSWORD
 *
 * Exit codes:
 *   0 — /co/jobs overview sound
 *   1 — at least one assertion failed
 *   2 — could not sign in / page never rendered
 */

import { chromium, type Browser, type Page } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:5173";
const REC_EMAIL = process.env.TEST_RECRUITER_EMAIL ?? "recruiter1@stripe.test";
const PASSWORD = process.env.TEST_PASSWORD ?? "testing123!";

let failed = false;
function fail(msg: string) {
  console.error(`  FAIL  ${msg}`);
  failed = true;
}
function ok(msg: string) {
  console.log(`  ok    ${msg}`);
}

async function signIn(page: Page) {
  await page.goto(`${APP_URL}/signin`);
  await page.locator('input[type="email"]').fill(REC_EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 20_000 });
}

async function main() {
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await signIn(page);
    await page.goto(`${APP_URL}/co/jobs`);

    // 1 — portal shell
    const sidebar = page.locator('aside[data-testid="portal-sidebar"]');
    try {
      await sidebar.waitFor({ state: "visible", timeout: 15_000 });
      ok("/co/jobs renders inside the portal shell");
    } catch {
      fail('/co/jobs has no aside[data-testid="portal-sidebar"]');
    }

    // 2 — posting rows
    const rows = page.locator('[data-testid="co-job-row"]');
    try {
      await rows.first().waitFor({ state: "visible", timeout: 10_000 });
    } catch {
      /* fall through to count */
    }
    const rowCount = await rows.count();
    if (rowCount >= 1) {
      ok(`${rowCount} job-posting row(s) listed`);
    } else {
      fail(
        '/co/jobs lists 0 postings — expected the company\'s postings (tag each ' +
          'row data-testid="co-job-row")',
      );
    }

    // 3 + 4 + 5 — each row: applicant count, funnel summary, per-job link
    let missingCount = 0;
    let missingFunnel = 0;
    let missingLink = 0;
    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);

      const countEl = row.locator('[data-testid="co-job-applicant-count"]').first();
      if ((await countEl.count()) === 0) {
        missingCount++;
      } else {
        const txt = ((await countEl.textContent()) ?? "").trim();
        if (!/\d/.test(txt)) missingCount++;
      }

      if ((await row.locator('[data-testid="co-job-funnel"]').count()) === 0) {
        missingFunnel++;
      }

      if ((await row.locator('a[href^="/co/jobs/"]').count()) === 0) {
        missingLink++;
      }
    }
    if (rowCount >= 1) {
      if (missingCount === 0) {
        ok("every posting row shows an applicant count");
      } else {
        fail(`${missingCount}/${rowCount} posting rows are missing a numeric applicant count`);
      }
      if (missingFunnel === 0) {
        ok("every posting row shows a funnel summary");
      } else {
        fail(`${missingFunnel}/${rowCount} posting rows are missing a funnel summary`);
      }
      if (missingLink === 0) {
        ok("every posting row links to its per-job pipeline (/co/jobs/:id)");
      } else {
        fail(`${missingLink}/${rowCount} posting rows do not link to /co/jobs/:id`);
      }
    }

    await browser.close();
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    console.error(`FAIL: company-jobs check threw: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  }

  if (failed) {
    console.error("\nFAIL: /co/jobs aggregate dashboard did not meet criterion 12");
    process.exit(1);
  }
  console.log("OK: /co/jobs lists postings with applicant counts + funnel summaries");
  process.exit(0);
}

main();
