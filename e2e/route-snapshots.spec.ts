/**
 * route-snapshots.spec.ts — cycle 2 per-route visual snapshots.
 *
 * Visits every public + authed route at desktop (1280×720) and mobile
 * (375×812) viewports and captures a screenshot snapshot. The first run after
 * route migration sets the golden baseline (Playwright's `updateSnapshots`
 * defaults to writing missing snapshots); subsequent runs diff against it.
 *
 * Why snapshots are captured AFTER migration (validator prediction p5): a
 * naive "snapshot now" against cycle-1's drifted routes would freeze the
 * broken state. These snapshots are the post-migration gold.
 *
 * Data determinism: several routes (`/me/credentials`, `/me/approvals`, …)
 * render server-mutated lists that the cycle-1 acceptance suite appends to
 * (CSV upload, unlock accept), which changes total page height run-to-run.
 * The snapshot is therefore viewport-clipped (`fullPage: false`) — the visual
 * contract is the above-the-fold design-system chrome (header geometry,
 * primitive rendering), not the unbounded list tail. Viewport-clipping makes
 * every route deterministic: appended rows below the fold never change the
 * captured frame.
 */

import { test, expect, type Page } from "@playwright/test";

const CAND_EMAIL = process.env.TEST_CANDIDATE_EMAIL ?? "candidate1@accountexecutive.test";
const REC_EMAIL = process.env.TEST_RECRUITER_EMAIL ?? "recruiter1@stripe.test";
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? "testing123!";

const DESKTOP = { width: 1280, height: 720 };
const MOBILE = { width: 375, height: 812 };

async function signIn(page: Page, email: string) {
  await page.goto("/signin");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 15_000 });
}

async function snapshot(page: Page, route: string, label: string) {
  await page.goto(route, { waitUntil: "networkidle" });
  // Settle lazy-loaded route content.
  await page.waitForTimeout(400);
  await expect(page).toHaveScreenshot(`${label}.png`, {
    // Viewport-clipped (not fullPage) — server-mutated lists below the fold
    // must not change the captured frame between runs.
    fullPage: false,
    // Generous tolerance — fonts + anti-aliasing differ by host.
    maxDiffPixelRatio: 0.05,
    animations: "disabled",
  });
}

const PUBLIC_ROUTES: Array<[string, string]> = [
  ["/", "home"],
  ["/signin", "signin"],
  ["/signup", "signup"],
  ["/404", "notfound"],
];

const CANDIDATE_ROUTES: Array<[string, string]> = [
  ["/me", "me"],
  ["/me/profile", "me-profile"],
  ["/me/intent", "me-intent"],
  ["/me/credentials", "me-credentials"],
  ["/me/approvals", "me-approvals"],
];

const COMPANY_ROUTES: Array<[string, string]> = [
  ["/co", "co"],
  ["/co/candidates", "co-candidates"],
  ["/co/company", "co-company"],
  ["/co/ats", "co-ats"],
  ["/co/billing", "co-billing"],
];

test.describe("cycle 2 — per-route visual snapshots @ desktop", () => {
  test.use({ viewport: DESKTOP });

  test("public routes — desktop", async ({ page }) => {
    for (const [route, label] of PUBLIC_ROUTES) {
      await snapshot(page, route, `desktop-${label}`);
    }
  });

  test("candidate routes — desktop", async ({ page }) => {
    await signIn(page, CAND_EMAIL);
    for (const [route, label] of CANDIDATE_ROUTES) {
      await snapshot(page, route, `desktop-${label}`);
    }
  });

  test("company routes — desktop", async ({ page }) => {
    await signIn(page, REC_EMAIL);
    for (const [route, label] of COMPANY_ROUTES) {
      await snapshot(page, route, `desktop-${label}`);
    }
  });
});

test.describe("cycle 2 — per-route visual snapshots @ mobile", () => {
  test.use({ viewport: MOBILE });

  test("public routes — mobile", async ({ page }) => {
    for (const [route, label] of PUBLIC_ROUTES) {
      await snapshot(page, route, `mobile-${label}`);
    }
  });

  test("candidate routes — mobile", async ({ page }) => {
    await signIn(page, CAND_EMAIL);
    for (const [route, label] of CANDIDATE_ROUTES) {
      await snapshot(page, route, `mobile-${label}`);
    }
  });

  test("company routes — mobile", async ({ page }) => {
    await signIn(page, REC_EMAIL);
    for (const [route, label] of COMPANY_ROUTES) {
      await snapshot(page, route, `mobile-${label}`);
    }
  });
});
