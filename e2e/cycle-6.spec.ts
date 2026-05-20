/**
 * cycle-6.spec.ts — acceptance for cycle `ae-hq-intent-consent-matchmaking`.
 *
 * Covers the runtime, browser-only success criteria:
 *
 *   - Criterion 9  — /me/intent: an AE toggles `auto_match` (and declares an
 *                    investor) and it PERSISTS across a reload. (The BFF
 *                    GET/PUT round-trip is also asserted by
 *                    check-intent-criteria-persist.ts.)
 *   - Criterion 10 — the company match-criteria surface persists criteria.
 *   - Criterion 11 — the matchmaking discovery surface: a criteria query
 *                    returns AE cards. (The constructed include/exclude/opt-out
 *                    case is asserted by check-discoverability.ts.)
 *   - Criterion 15 — the discovery cards are ANONYMIZED: a card shows initials,
 *                    never a real full name.
 *   - express-interest — a discovery card drives all the way to expressing
 *                    interest; the card's outcome flips to a match state. No
 *                    dead-end browsing.
 *   - Criterion 16 — the cycle-4 flicker fix STILL HOLDS: the portal sidebar
 *                    <aside data-testid="portal-sidebar"> is the SAME DOM node
 *                    across an in-portal navigation (no remount).
 *
 * Matching is a deterministic predicate filter — this spec asserts presence /
 * anonymization / consent state, never a ranked order (ranking is cycle 7).
 */

import { test, expect, type Page } from "@playwright/test";

const CAND_EMAIL = process.env.TEST_CANDIDATE_EMAIL ?? "candidate1@accountexecutive.test";
const REC_EMAIL = process.env.TEST_RECRUITER_EMAIL ?? "recruiter1@stripe.test";
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? "testing123!";

const SIDEBAR = '[data-testid="portal-sidebar"]';

async function signIn(page: Page, email: string) {
  await page.goto("/signin");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 20_000 });
}

test.describe("cycle 6 acceptance — intent, consent & matchmaking", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // CRITERION 9 — /me/intent: the auto_match toggle persists
  // ══════════════════════════════════════════════════════════════════════════
  test("intent — AE toggles auto_match + declares an investor and it persists", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, CAND_EMAIL);
    await page.goto("/me/intent");

    // the auto_match toggle is a role=switch — read its current state, flip it.
    const autoMatch = page.locator("#intent-auto-match");
    await expect(autoMatch, "the intent surface must have an auto_match toggle").toBeVisible({
      timeout: 15_000,
    });
    const before = await autoMatch.getAttribute("aria-checked");
    await autoMatch.click();
    const flipped = before === "true" ? "false" : "true";
    await expect(autoMatch).toHaveAttribute("aria-checked", flipped);

    // declare an investor via the investor TagInput.
    const investorField = page.locator("#intent-investors");
    await expect(investorField).toBeVisible();
    await investorField.fill("Benchmark Capital");
    await investorField.press("Enter");

    // save.
    await page.locator('[data-testid="save-intent"]').click();
    await expect(page.locator("text=SAVED")).toBeVisible({ timeout: 10_000 });

    // reload — the toggle state and the investor chip must persist.
    await page.reload();
    await expect(page.locator("#intent-auto-match")).toHaveAttribute(
      "aria-checked",
      flipped,
      { timeout: 15_000 },
    );
    await expect(
      page.locator("text=Benchmark Capital"),
      "the declared investor must persist across a reload",
    ).toBeVisible();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CRITERION 10 — the company match-criteria surface persists criteria
  // ══════════════════════════════════════════════════════════════════════════
  test("match-criteria — a company sets a min-years floor and it persists", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, REC_EMAIL);
    await page.goto("/co/match-criteria");

    const minYears = page.locator("#criteria-min-years");
    await expect(minYears, "the match-criteria surface must have a min-years field").toBeVisible({
      timeout: 15_000,
    });
    await minYears.fill("6");
    await page.locator('[data-testid="save-criteria"]').click();
    await expect(page.locator("text=SAVED")).toBeVisible({ timeout: 10_000 });

    // reload — the min-years value persists.
    await page.reload();
    await expect(page.locator("#criteria-min-years")).toHaveValue("6", { timeout: 15_000 });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CRITERION 11 + 15 + express-interest — the matchmaking discovery surface
  // ══════════════════════════════════════════════════════════════════════════
  test("discover — matchmaking surface returns anonymized cards; express-interest works", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, REC_EMAIL);
    await page.goto("/co/discover");

    // run a permissive criteria query (no narrowing) — the discoverability
    // filter is the only thing narrowing the set.
    const runBtn = page.locator('[data-testid="run-discover"]');
    await expect(runBtn, "the discovery surface must have a search control").toBeVisible({
      timeout: 15_000,
    });
    await runBtn.click();

    // results render as anonymized AE cards.
    const cards = page.locator('[data-testid^="discover-card-"]');
    await expect(
      cards.first(),
      "a discovery query should return at least one discoverable AE card",
    ).toBeVisible({ timeout: 15_000 });

    // ── CRITERION 15 — the card is ANONYMIZED ──────────────────────────────
    // the card shows initials (1-2 uppercase letters), never a real full name.
    // the seeded anon candidates have names like "Sarah Anderson" — assert no
    // such two-word capitalized name string appears on the discovery card.
    const firstCardText = (await cards.first().innerText()).trim();
    expect(
      /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(firstCardText),
      `the discovery card must be anonymized — found what looks like a full name in: ` +
        `"${firstCardText.slice(0, 120)}"`,
    ).toBe(false);

    // ── express-interest — the card drives toward a match; no dead end ─────
    const cardId = (await cards.first().getAttribute("data-testid"))?.replace(
      "discover-card-",
      "",
    );
    expect(cardId, "the discovery card must carry a candidate id").toBeTruthy();
    const interestBtn = page.locator(`[data-testid="express-interest-${cardId}"]`);
    await expect(
      interestBtn,
      "every discovery card must drive toward express-interest (no dead-end browsing)",
    ).toBeVisible();
    await interestBtn.click();

    // after expressing interest the card's action flips to a match-status
    // pill ("Connected" on an immediate resolve, "Awaiting …" on a pending
    // match) — the express-interest action produced a real outcome.
    await expect(
      page.locator(`[data-testid="discover-card-${cardId}"]`),
      "expressing interest must produce a visible match outcome on the card",
    ).toContainText(/Connected|Awaiting/, { timeout: 10_000 });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CRITERION 16 — the cycle-4 flicker fix still holds on the new routes
  // ══════════════════════════════════════════════════════════════════════════
  test("flicker — portal sidebar is the same DOM node across a /co/discover nav", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, REC_EMAIL);

    // land on the company dashboard, stamp the sidebar with a unique marker.
    await page.goto("/co");
    const sidebar = page.locator(SIDEBAR);
    await expect(sidebar).toBeVisible({ timeout: 15_000 });
    const marker = `c6-flicker-${Date.now()}`;
    await sidebar.evaluate((el, m) => {
      (el as HTMLElement & { __c6flicker?: string }).__c6flicker = m;
    }, marker);

    // navigate to /co/discover via the in-app NavLink (NOT page.goto — a
    // reload would legitimately remount everything and mask the bug).
    const discoverLink = sidebar
      .locator("a")
      .filter({ hasText: /discover/i })
      .first();
    await expect(discoverLink, 'the sidebar must have a "Discover" link').toBeVisible();
    await discoverLink.click();
    await page.waitForURL(/\/co\/discover$/, { timeout: 10_000 });

    // the SAME <aside> node must still carry the marker — a React
    // unmount/remount produces a fresh node with no marker. The sidebar must
    // be the same DOM node across the in-portal navigation.
    const sameNode = await page
      .locator(SIDEBAR)
      .evaluate(
        (el, m) => (el as HTMLElement & { __c6flicker?: string }).__c6flicker === m,
        marker,
      );
    expect(
      sameNode,
      "the portal sidebar remounted across the /co/discover navigation — the cycle-4 flicker fix regressed",
    ).toBe(true);
  });
});
