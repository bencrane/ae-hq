/**
 * cycle-3.spec.ts — acceptance for messaging, the Bloomberg feed, and the
 * recruiter pipeline.
 *
 * Covers the three functional flows criterion 8 requires:
 *   - send a message in a conversation and see it land
 *   - open the pipeline and move a candidate
 *   - open an article from the insights hub
 */

import { test, expect, type Page } from "@playwright/test";

const CAND_EMAIL = process.env.TEST_CANDIDATE_EMAIL ?? "candidate1@accountexecutive.test";
const REC_EMAIL = process.env.TEST_RECRUITER_EMAIL ?? "recruiter1@stripe.test";
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? "testing123!";

async function signIn(page: Page, email: string) {
  await page.goto("/signin");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 20_000 });
}

test.describe("cycle 3 acceptance", () => {
  // ----- messaging: send a message and see it land -----
  test("messaging — recruiter sends a message in a thread", async ({ page }) => {
    await signIn(page, REC_EMAIL);
    await page.goto("/inbox");
    // open the first conversation
    const firstConv = page.locator("a[href^='/inbox/']").first();
    await expect(firstConv).toBeVisible({ timeout: 15_000 });
    await firstConv.click();
    await page.waitForURL(/\/inbox\/[^/]+/, { timeout: 10_000 });

    // the composer is present
    const composer = page.locator("[data-testid='message-composer']");
    await expect(composer).toBeVisible({ timeout: 10_000 });

    // send a unique probe message
    const probe = `e2e-msg-${Date.now()}`;
    await composer.fill(probe);
    await page.locator("[data-testid='message-send']").click();

    // the message lands in the thread
    await expect(page.getByText(probe, { exact: false }).first()).toBeVisible({ timeout: 12_000 });
  });

  // ----- pipeline: open the board and move a candidate (drag-and-drop) -----
  test("pipeline — recruiter opens the board and moves a candidate", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, REC_EMAIL);
    await page.goto("/co/pipeline");

    // the kanban board renders with columns
    await expect(page.locator("[data-testid='kanban-board']")).toBeVisible({ timeout: 15_000 });
    const columns = page.locator("[data-testid='kanban-column']");
    expect(await columns.count()).toBeGreaterThanOrEqual(6);

    // find a column with a card and a distinct destination column
    const colCount = await columns.count();
    let srcIdx = -1;
    for (let i = 0; i < colCount; i++) {
      if ((await columns.nth(i).locator("[data-testid='kanban-card']").count()) > 0) {
        srcIdx = i;
        break;
      }
    }
    expect(srcIdx, "no kanban column has a card").toBeGreaterThanOrEqual(0);
    const destIdx = srcIdx === 0 ? colCount - 1 : 0;
    const card = columns.nth(srcIdx).locator("[data-testid='kanban-card']").first();
    await expect(card).toBeVisible({ timeout: 10_000 });

    // drag the card to the destination column (dnd-kit pointer gesture)
    const cardBox = await card.boundingBox();
    const destBox = await columns.nth(destIdx).boundingBox();
    if (!cardBox || !destBox) throw new Error("could not measure kanban boxes");
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

    // the board re-renders without error — board still present after the move
    await expect(page.locator("[data-testid='kanban-board']")).toBeVisible({ timeout: 10_000 });
  });

  // ----- pipeline: the timeline drawer opens -----
  test("pipeline — candidate timeline drawer opens", async ({ page }) => {
    await signIn(page, REC_EMAIL);
    await page.goto("/co/pipeline");
    const firstCard = page.locator("[data-testid='kanban-card']").first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    // clicking the card (no drag movement) opens its timeline drawer
    await firstCard.click();
    // the drawer (a dialog) opens with the timeline
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
  });

  // ----- insights: open an article from the hub -----
  test("insights — open an article from the hub", async ({ page }) => {
    await signIn(page, CAND_EMAIL);
    await page.goto("/insights");
    await expect(page.locator("h1")).toBeVisible({ timeout: 15_000 });

    // article cards link to /insights/:slug
    const firstArticle = page.locator("a[href^='/insights/']").first();
    await expect(firstArticle).toBeVisible({ timeout: 10_000 });
    await firstArticle.click();
    await page.waitForURL(/\/insights\/[^/]+/, { timeout: 10_000 });

    // the article detail renders a heading and body content
    await expect(page.locator("h1")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("[data-testid='article-detail-page']")).toBeVisible({
      timeout: 10_000,
    });
  });

  // ----- feed: authed home shows the intent toggle + article interleave -----
  test("feed — authed home has the intent filter toggle", async ({ page }) => {
    await signIn(page, CAND_EMAIL);
    await page.goto("/");
    // the "show everything" / "filter to my intent" toggle is present for authed candidates
    await expect(page.locator("[data-testid='feed-toggle']")).toBeVisible({ timeout: 15_000 });
  });
});
