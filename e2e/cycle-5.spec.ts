/**
 * cycle-5.spec.ts — acceptance for cycle `ae-hq-jobs-as-objects`.
 *
 * Covers the runtime, browser-only success criteria:
 *
 *   - Criterion 11 — a candidate applies to a job from inside the portal:
 *                    the apply control flips to an applied-state; re-visiting
 *                    the job still shows applied-state. (The DB side effect +
 *                    idempotency are asserted by check-apply-idempotent.ts.)
 *
 *   - Criterion 13 — the per-job kanban at /co/jobs/:id: an application card
 *                    dragged column→column lands in the destination column.
 *                    (The stage-persist + pipeline_activity side effect is
 *                    asserted by check-application-move.ts.)
 *
 *   - Criterion 14 — kanban geometry GUARD. This spec drags between ADJACENT
 *                    columns and, before dragging, asserts every column is
 *                    >= 280px wide. This is the structural defense for the
 *                    carried-over cycle-4 failure: cycle 4's drag test
 *                    dragged to the LAST of six columns, which forced the
 *                    executor to shrink columns to 176px so all six fit one
 *                    viewport. An adjacent-column drag NEVER requires all
 *                    columns visible at once, so it cannot pressure column
 *                    width. The standalone check-kanban-width.ts is the
 *                    primary arbiter; this in-spec assertion makes the
 *                    constraint impossible to satisfy by re-shrinking.
 *
 *   - Criterion 16 — the cycle-4 flicker fix STILL HOLDS: the portal sidebar
 *                    <aside data-testid="portal-sidebar"> is the SAME DOM
 *                    node across an in-portal navigation (no remount).
 *
 * dnd-kit drag technique: dnd-kit uses PointerSensor — it does NOT respond to
 * Playwright's HTML5 dragTo(). It needs a real pointer gesture: mouse.down on
 * the card, several intermediate mouse.move steps (dnd-kit has an activation
 * distance and computes collisions on move), then mouse.up over the target.
 */

import { test, expect, type Page } from "@playwright/test";

const CAND_EMAIL = process.env.TEST_CANDIDATE_EMAIL ?? "candidate1@accountexecutive.test";
const REC_EMAIL = process.env.TEST_RECRUITER_EMAIL ?? "recruiter1@stripe.test";
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? "testing123!";

const SIDEBAR = '[data-testid="portal-sidebar"]';
/** The directive's K fix: columns at a readable width (~280–300px). */
const MIN_COL_PX = 280;

async function signIn(page: Page, email: string) {
  await page.goto("/signin");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 20_000 });
}

test.describe("cycle 5 acceptance — jobs as objects", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // CRITERION 11 — candidate applies to a job from inside the portal
  // ══════════════════════════════════════════════════════════════════════════
  test("apply — candidate applies to a job and sees applied-state", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, CAND_EMAIL);
    await page.goto("/me/jobs");

    // open a job that is NOT yet applied to. An applied job card carries
    // data-applied="true"; pick the first card without it.
    const cards = page.locator('[data-testid="job-card"]');
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
    const count = await cards.count();
    let target = -1;
    for (let i = 0; i < count; i++) {
      if ((await cards.nth(i).getAttribute("data-applied")) !== "true") {
        target = i;
        break;
      }
    }
    expect(target, "no un-applied job card on /me/jobs to test apply").toBeGreaterThanOrEqual(0);
    await cards.nth(target).click();

    // the job detail surface exposes an apply control
    const applyBtn = page.locator('[data-testid="job-apply-button"]');
    await expect(applyBtn).toBeVisible({ timeout: 10_000 });
    await applyBtn.click();

    // after applying, an applied-state indicator appears
    const appliedState = page.locator('[data-testid="job-applied-state"]');
    await expect(
      appliedState,
      "the job detail must show an applied-state after applying",
    ).toBeVisible({ timeout: 10_000 });

    // reload the job detail — applied-state persists
    await page.reload();
    await expect(
      page.locator('[data-testid="job-applied-state"]'),
      "applied-state must persist across a reload",
    ).toBeVisible({ timeout: 10_000 });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CRITERION 13 + 14 — per-job kanban: adjacent-column drag + width guard
  // ══════════════════════════════════════════════════════════════════════════
  test("per-job kanban — columns >= 280px and an adjacent-column drag persists", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, REC_EMAIL);

    // reach a per-job pipeline via the company jobs overview, so the test
    // exercises the real /co/jobs -> /co/jobs/:id navigation.
    await page.goto("/co/jobs");
    const jobLink = page.locator("a[href^='/co/jobs/']").first();
    await expect(jobLink, "/co/jobs must list postings linking to per-job pipelines").toBeVisible({
      timeout: 15_000,
    });
    await jobLink.click();
    await page.waitForURL(/\/co\/jobs\/[^/]+$/, { timeout: 10_000 });

    const board = page.locator("[data-testid='kanban-board']");
    await expect(board).toBeVisible({ timeout: 15_000 });
    const columns = page.locator("[data-testid='kanban-column']");
    const colCount = await columns.count();
    expect(colCount, "per-job pipeline must render the company's stage columns").toBeGreaterThanOrEqual(
      2,
    );

    // ── CRITERION 14 guard — EVERY column is >= 280px wide ──────────────────
    // This runs at a 1280px viewport. The cycle-4 board fit six 176px columns
    // here; a correct board has >= 280px columns and scrolls horizontally.
    for (let i = 0; i < colCount; i++) {
      const box = await columns.nth(i).boundingBox();
      expect(
        box?.width ?? 0,
        `kanban column ${i} rendered at ${Math.round(box?.width ?? 0)}px — must be >= ` +
          `${MIN_COL_PX}px (do NOT shrink columns to satisfy a test; drag adjacent columns)`,
      ).toBeGreaterThanOrEqual(MIN_COL_PX);
    }

    // the board owns the horizontal scroll
    const overflow = await board.evaluate((el) => ({
      scrollable: el.scrollWidth > el.clientWidth + 1,
      overflowX: getComputedStyle(el).overflowX,
    }));
    expect(
      overflow.scrollable && /(auto|scroll)/.test(overflow.overflowX),
      "the per-job kanban board must own its horizontal scroll region",
    ).toBe(true);

    // ── CRITERION 13 — drag an application card to an ADJACENT column ───────
    // find an adjacent (src, dest) pair where src has a card. Adjacent so the
    // drag never needs all columns on screen at once.
    let srcIdx = -1;
    let destIdx = -1;
    for (let i = 0; i < colCount; i++) {
      const hasCard =
        (await columns.nth(i).locator("[data-testid='kanban-card']").count()) > 0;
      if (!hasCard) continue;
      if (i + 1 < colCount) {
        srcIdx = i;
        destIdx = i + 1;
        break;
      }
      if (i - 1 >= 0) {
        srcIdx = i;
        destIdx = i - 1;
        break;
      }
    }
    expect(srcIdx, "no kanban column has a draggable application card").toBeGreaterThanOrEqual(0);

    const card = columns.nth(srcIdx).locator("[data-testid='kanban-card']").first();
    const destCol = columns.nth(destIdx);
    await expect(card).toBeVisible({ timeout: 10_000 });

    // both adjacent columns must be on screen — bring the source into view;
    // an adjacent column is at most ~300px away so it is visible too.
    await card.scrollIntoViewIfNeeded();

    const cardId = await card.getAttribute("data-application-id");
    expect(
      cardId,
      "each kanban card must carry data-application-id for the e2e drag check",
    ).toBeTruthy();

    const cardBox = await card.boundingBox();
    const destBox = await destCol.boundingBox();
    if (!cardBox || !destBox) throw new Error("could not measure card/column boxes");

    const startX = cardBox.x + cardBox.width / 2;
    const startY = cardBox.y + cardBox.height / 2;
    const endX = destBox.x + destBox.width / 2;
    const endY = destBox.y + Math.min(80, destBox.height / 2);

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    for (let s = 1; s <= 6; s++) {
      await page.mouse.move(
        startX + ((endX - startX) * s) / 6,
        startY + ((endY - startY) * s) / 6,
        { steps: 4 },
      );
    }
    await page.mouse.up();

    // the dragged card now lives in the adjacent destination column
    await expect(
      destCol.locator(`[data-application-id="${cardId}"]`),
      "the dragged application card did not land in the adjacent destination column",
    ).toBeVisible({ timeout: 10_000 });
    await expect(board).toBeVisible({ timeout: 5_000 });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CRITERION 16 — the cycle-4 flicker fix still holds on the new routes
  // ══════════════════════════════════════════════════════════════════════════
  test("flicker — portal sidebar is the same DOM node across a /me/jobs nav", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, CAND_EMAIL);

    // land on the dashboard, stamp the sidebar with a unique marker
    await page.goto("/me");
    const sidebar = page.locator(SIDEBAR);
    await expect(sidebar).toBeVisible({ timeout: 15_000 });
    const marker = `c5-flicker-${Date.now()}`;
    await sidebar.evaluate((el, m) => {
      (el as HTMLElement & { __c5flicker?: string }).__c5flicker = m;
    }, marker);

    // navigate to /me/jobs via the in-app NavLink (NOT page.goto — a reload
    // would legitimately remount everything and mask the bug).
    const browseLink = sidebar
      .locator("a")
      .filter({ hasText: /browse jobs/i })
      .first();
    await expect(browseLink, 'the sidebar must have a "Browse jobs" link').toBeVisible();
    await browseLink.click();
    await page.waitForURL(/\/me\/jobs$/, { timeout: 10_000 });

    // the SAME <aside> node must still carry the marker — a React
    // unmount/remount produces a fresh node with no marker.
    const sameNode = await page
      .locator(SIDEBAR)
      .evaluate(
        (el, m) => (el as HTMLElement & { __c5flicker?: string }).__c5flicker === m,
        marker,
      );
    expect(
      sameNode,
      "the portal sidebar remounted across the /me/jobs navigation — the cycle-4 flicker fix regressed",
    ).toBe(true);
  });
});
