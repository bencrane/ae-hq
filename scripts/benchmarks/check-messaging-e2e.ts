#!/usr/bin/env tsx
/**
 * check-messaging-e2e.ts
 *
 * Criterion 10 verifier — messaging end-to-end across two real sessions.
 *
 * Drives two independent Playwright browser CONTEXTS in one process:
 *   - context R: signed in as the recruiter (recruiter1@stripe.test)
 *   - context C: signed in as the candidate (candidate1@accountexecutive.test)
 *
 * Flow:
 *   1. Recruiter opens /inbox, picks the conversation with the seeded
 *      candidate, types a unique probe message, sends it.
 *   2. The candidate (separate context, separate cookies) opens the SAME
 *      conversation via /inbox and asserts the probe message is present.
 *
 * The probe string is unique per run (timestamp) so a stale seeded message
 * can never produce a false PASS. SSE live-delivery is a bonus — this check
 * is satisfied by the message being *retrievable* on the candidate side
 * after a fresh navigation, which a polled fetch or an SSE push both
 * satisfy. (Live SSE delivery without reload is asserted opportunistically.)
 *
 * Required env:
 *   APP_URL                 (default http://localhost:5173)
 *   TEST_CANDIDATE_EMAIL    (default candidate1@accountexecutive.test)
 *   TEST_RECRUITER_EMAIL    (default recruiter1@stripe.test)
 *   TEST_PASSWORD           (default testing123!)
 *
 * Exit codes:
 *   0 — message sent by recruiter is visible to the candidate
 *   1 — message did not propagate, or a precondition failed
 *   2 — could not sign in / no seeded conversation to use
 */

import { chromium, type Browser, type Page } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:5173";
const CAND_EMAIL = process.env.TEST_CANDIDATE_EMAIL ?? "candidate1@accountexecutive.test";
const REC_EMAIL = process.env.TEST_RECRUITER_EMAIL ?? "recruiter1@stripe.test";
const PASSWORD = process.env.TEST_PASSWORD ?? "testing123!";

async function signIn(page: Page, email: string) {
  await page.goto(`${APP_URL}/signin`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 20_000 });
}

/**
 * Open /inbox and click the first conversation in the conversation list.
 * Returns the deep-linked conversation URL so the other side can open the
 * exact same thread. Falls back to /inbox/:id discovery via the address bar.
 */
async function openFirstConversation(page: Page): Promise<string> {
  await page.goto(`${APP_URL}/inbox`);
  // conversation list items deep-link to /inbox/:id
  const firstItem = page.locator("a[href^='/inbox/']").first();
  await firstItem.waitFor({ state: "visible", timeout: 15_000 });
  await firstItem.click();
  await page.waitForURL(/\/inbox\/[^/]+/, { timeout: 10_000 });
  return page.url();
}

async function main() {
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch();

    // ----- recruiter context -----
    const recCtx = await browser.newContext();
    const rec = await recCtx.newPage();
    await signIn(rec, REC_EMAIL);
    const threadUrl = await openFirstConversation(rec);
    // derive the conversation id + a path the candidate can open
    const convId = threadUrl.split("/inbox/")[1]?.split(/[?#]/)[0] ?? "";
    if (!convId) {
      console.error("FAIL: recruiter could not open a seeded conversation (no /inbox/:id)");
      process.exit(2);
    }

    // ----- candidate context: open the SAME thread, keep it open for SSE -----
    const candCtx = await browser.newContext();
    const cand = await candCtx.newPage();
    await signIn(cand, CAND_EMAIL);
    await cand.goto(`${APP_URL}/inbox/${convId}`);
    // the candidate may not be a participant of THAT thread — if the page
    // shows an empty/forbidden state, fall back to the candidate's own first
    // conversation and re-derive the shared thread from the recruiter side.
    const candThreadOk = await cand
      .locator("textarea, input[type='text'], [data-testid='message-composer']")
      .first()
      .isVisible({ timeout: 8_000 })
      .catch(() => false);

    let sharedConvId = convId;
    if (!candThreadOk) {
      // discover a conversation the candidate IS in, then have the recruiter
      // open that same one (recruiter sees all company threads).
      const candThread = await openFirstConversation(cand);
      sharedConvId = candThread.split("/inbox/")[1]?.split(/[?#]/)[0] ?? "";
      if (!sharedConvId) {
        console.error("FAIL: candidate has no conversation to use");
        process.exit(2);
      }
      await rec.goto(`${APP_URL}/inbox/${sharedConvId}`);
      await rec
        .locator("textarea, input[type='text'], [data-testid='message-composer']")
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
    } else {
      // candidate already on the shared thread — keep it there for live SSE
      await cand.goto(`${APP_URL}/inbox/${sharedConvId}`);
    }

    // ----- recruiter sends a unique probe message -----
    const probe = `e2e-probe-${Date.now()}`;
    const composer = rec
      .locator("textarea, input[type='text'], [data-testid='message-composer']")
      .first();
    await composer.waitFor({ state: "visible", timeout: 10_000 });
    await composer.fill(probe);
    // submit: prefer an explicit send button, fall back to Enter
    const sendBtn = rec.locator(
      "[data-testid='message-send'], button:has-text('Send'), button[type='submit']",
    );
    if (await sendBtn.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      await sendBtn.first().click();
    } else {
      await composer.press("Enter");
    }
    // recruiter's own thread should show the probe (optimistic or refetch)
    await rec.getByText(probe, { exact: false }).first().waitFor({ state: "visible", timeout: 10_000 });

    // ----- candidate must see the probe -----
    // First try live (SSE): the candidate page is already on the thread.
    let liveDelivered = false;
    try {
      await cand.getByText(probe, { exact: false }).first().waitFor({ state: "visible", timeout: 8_000 });
      liveDelivered = true;
    } catch {
      // not live — reload and assert it is at least retrievable
      await cand.goto(`${APP_URL}/inbox/${sharedConvId}`);
      await cand.getByText(probe, { exact: false }).first().waitFor({ state: "visible", timeout: 12_000 });
    }

    console.log(
      `OK: recruiter→candidate message propagated (conv=${sharedConvId}, live_sse=${liveDelivered})`,
    );
    process.exit(0);
  } catch (e) {
    console.error(`FAIL: messaging e2e: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

main();
