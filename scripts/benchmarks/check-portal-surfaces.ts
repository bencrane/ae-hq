#!/usr/bin/env tsx
/**
 * check-portal-surfaces.ts
 *
 * Criteria 9 + 10 + 15 verifier for cycle `ae-hq-jobs-as-objects`.
 *
 * A browser check (Playwright) over the three new candidate/company surfaces.
 * Signs in as the seeded candidate and asserts:
 *
 *   #9  `/me/jobs` renders INSIDE the portal shell:
 *        - the portal sidebar `aside[data-testid="portal-sidebar"]` is present
 *        - the candidate sidebar's "Browse jobs" link points at `/me/jobs`,
 *          NOT the public `/`. We read the nav link's href and assert it
 *          resolves to `/me/jobs`. (A "Browse jobs" entry that still routes
 *          to `/` is the exact #9 regression.)
 *
 *   #10 `/me/jobs` shows >= 2 curated collections as titled card groups:
 *        - >= 2 `[data-testid="job-collection"]` sections exist
 *        - each has a non-empty title (`[data-testid="job-collection-title"]`)
 *        - each contains >= 1 job card (`[data-testid="job-card"]`)
 *
 *   #15 the company profile at `/companies/:slug` renders the real profile:
 *        - reachable FROM a job detail — we open a job inside the portal,
 *          click the company link, and land on `/companies/:slug`
 *        - the profile lists investors: `[data-testid="company-investors"]`
 *          is present and contains >= 1 named investor entry
 *          (`[data-testid="company-investor"]`)
 *        - the profile shows open roles (`[data-testid="company-open-role"]`,
 *          >= 1) — a profile with firmographics but no roles is a stub
 *
 * The Stripe company is seeded with investors (cycle-4 firmographic seed),
 * so `/companies/stripe` is the deterministic target for the investor
 * assertion.
 *
 * Required env:
 *   APP_URL (default http://localhost:5173)
 *   TEST_CANDIDATE_EMAIL (default candidate1@accountexecutive.test), TEST_PASSWORD
 *
 * Exit codes:
 *   0 — all three surfaces sound
 *   1 — at least one surface assertion failed
 *   2 — could not sign in / a page never rendered
 */

import { chromium, type Browser, type Page } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:5173";
const CAND_EMAIL = process.env.TEST_CANDIDATE_EMAIL ?? "candidate1@accountexecutive.test";
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
  await page.locator('input[type="email"]').fill(CAND_EMAIL);
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

    // ── #9 — /me/jobs renders inside the portal shell ──────────────────────
    await page.goto(`${APP_URL}/me/jobs`);
    const sidebar = page.locator('aside[data-testid="portal-sidebar"]');
    try {
      await sidebar.waitFor({ state: "visible", timeout: 15_000 });
      ok("/me/jobs renders inside the portal shell (portal-sidebar present)");
    } catch {
      fail('/me/jobs has no aside[data-testid="portal-sidebar"] — not inside the portal shell');
    }

    // "Browse jobs" nav link must target /me/jobs, not public /.
    // Match the link by accessible text within the sidebar.
    const browseLink = sidebar
      .locator("a")
      .filter({ hasText: /browse jobs/i })
      .first();
    if ((await browseLink.count()) === 0) {
      fail('no "Browse jobs" link found in the portal sidebar');
    } else {
      const href = (await browseLink.getAttribute("href")) ?? "";
      // href may be absolute or relative; normalize the pathname.
      let pathname = href;
      try {
        pathname = new URL(href, APP_URL).pathname;
      } catch {
        /* href was already a path */
      }
      if (pathname === "/me/jobs") {
        ok('"Browse jobs" link points at /me/jobs');
      } else {
        fail(`"Browse jobs" link points at "${pathname}" — must be /me/jobs, not public /`);
      }
    }

    // ── #10 — >= 2 curated collections, each titled, each with cards ───────
    const collections = page.locator('[data-testid="job-collection"]');
    // collections render after the jobs query resolves
    try {
      await collections.first().waitFor({ state: "visible", timeout: 10_000 });
    } catch {
      /* fall through to the count assertion */
    }
    const colCount = await collections.count();
    if (colCount >= 2) {
      ok(`${colCount} curated job collections rendered`);
      let titled = 0;
      let withCards = 0;
      for (let i = 0; i < colCount; i++) {
        const c = collections.nth(i);
        const title = (
          (await c.locator('[data-testid="job-collection-title"]').first().textContent()) ?? ""
        ).trim();
        if (title.length > 0) titled++;
        if ((await c.locator('[data-testid="job-card"]').count()) >= 1) withCards++;
      }
      if (titled === colCount) {
        ok("every collection has a non-empty title");
      } else {
        fail(`${colCount - titled}/${colCount} collections have an empty/missing title`);
      }
      if (withCards === colCount) {
        ok("every collection contains >= 1 job card");
      } else {
        fail(`${colCount - withCards}/${colCount} collections contain no job cards`);
      }
    } else {
      fail(
        `/me/jobs shows ${colCount} curated collection(s) — directive requires >= 2 titled ` +
          `card groups (tag each with data-testid="job-collection")`,
      );
    }

    // ── #15 — company profile, reachable from a job detail, investors listed
    // Open a job inside the portal: click the first job card on /me/jobs.
    const firstJobCard = page.locator('[data-testid="job-card"]').first();
    let reachedCompanyFromJob = false;
    if ((await firstJobCard.count()) > 0) {
      await firstJobCard.click();
      // a job detail surface — find the company link and click it
      const companyLink = page
        .locator('[data-testid="job-company-link"]')
        .first();
      try {
        await companyLink.waitFor({ state: "visible", timeout: 10_000 });
        await companyLink.click();
        await page.waitForURL(/\/companies\//, { timeout: 10_000 });
        reachedCompanyFromJob = true;
        ok("company profile reachable from a job detail (job -> company link)");
      } catch {
        fail(
          'could not reach a company profile from a job detail — the job detail must expose ' +
            'a company link tagged data-testid="job-company-link"',
        );
      }
    } else {
      fail("no job card on /me/jobs to open a job detail from");
    }

    // Land on /companies/stripe directly for the investor assertion — Stripe
    // is the company seeded with investor firms (cycle-4 firmographic seed).
    if (!reachedCompanyFromJob) {
      await page.goto(`${APP_URL}/companies/stripe`);
    } else {
      await page.goto(`${APP_URL}/companies/stripe`);
    }
    const investorsBlock = page.locator('[data-testid="company-investors"]');
    try {
      await investorsBlock.waitFor({ state: "visible", timeout: 10_000 });
    } catch {
      /* fall through */
    }
    if ((await investorsBlock.count()) === 0) {
      fail('/companies/stripe has no [data-testid="company-investors"] block');
    } else {
      const investorItems = investorsBlock.locator('[data-testid="company-investor"]');
      const n = await investorItems.count();
      if (n >= 1) {
        const sample = ((await investorItems.first().textContent()) ?? "").trim();
        ok(`company profile lists ${n} investor(s) (e.g. "${sample}")`);
      } else {
        fail(
          'the investors block has no [data-testid="company-investor"] entries — ' +
            "investor firms must be listed individually",
        );
      }
    }
    const openRoles = page.locator('[data-testid="company-open-role"]');
    const roleCount = await openRoles.count();
    if (roleCount >= 1) {
      ok(`company profile shows ${roleCount} open role(s)`);
    } else {
      fail("/companies/stripe shows no open roles — a real profile lists the company's postings");
    }

    await browser.close();
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    console.error(
      `FAIL: portal-surfaces check threw: ${e instanceof Error ? e.message : String(e)}`,
    );
    process.exit(2);
  }

  if (failed) {
    console.error("\nFAIL: one or more portal surfaces did not meet criteria 9/10/15");
    process.exit(1);
  }
  console.log("OK: /me/jobs in portal shell + >= 2 collections + company profile with investors");
  process.exit(0);
}

main();
