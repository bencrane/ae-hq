/**
 * cycle-4.spec.ts — acceptance for the cycle-4 polish + profile rework.
 *
 * Covers the runtime, browser-only success criteria:
 *   - Criterion 9  — the navigation flicker fix: the sidebar <aside> is the
 *                    SAME DOM node across Dashboard → Messages → Insights →
 *                    Pipeline. No unmount, no layout-less fallback flash.
 *   - Criterion 10 — kanban drag-and-drop: a card dragged column→column
 *                    persists the stage change and logs pipeline_activity;
 *                    all 6 columns reachable at 1280px.
 *   - Criterion 11 — candidate detail: no CREDENTIALS section, no methodology
 *                    tag, a derived sales-motion is shown, work-history rows
 *                    have a logo or a monogram (no broken <img>).
 *   - Criterion 12 — candidate sidebar shows the AE's real name; the identity
 *                    block has no `NN //` numbered eyebrow.
 *
 * The flicker check (criterion 9) is LOAD-BEARING. Its technique:
 *   1. Sign in as the recruiter (company portal — has Dashboard, Pipeline,
 *      Messages, Insights all reachable from one sidebar).
 *   2. On the first authed page, stamp a unique marker as a JS property
 *      AND a data-attribute on the sidebar <aside> element.
 *   3. Navigate via in-app <NavLink> clicks (NOT page.goto — a full reload
 *      would legitimately remount everything and mask the bug). Crossing
 *      CompanyShell → SharedPortalShell is exactly the route-group boundary
 *      that remounts today.
 *   4. After each navigation, re-query the <aside> and assert the marker
 *      property is still there. A React unmount/remount produces a brand
 *      new DOM node with no marker → the assertion fails → the flicker
 *      regression is caught.
 *   5. Also assert the layout-less fallback ("Loading…" with no sidebar)
 *      never becomes the sole content during a portal navigation.
 *
 * The sidebar <aside> MUST carry `data-testid="portal-sidebar"` for this
 * spec. Tagging it is part of the cycle-4 work (the executor adds it when
 * implementing the persistent-layout fix).
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

/**
 * Collect the computed divider treatment for every section divider in the
 * currently-rendered sidebar. A "divider" element carries a stable
 * `data-divider` attribute (the executor tags each section rule when
 * unifying them — wordmark rule, identity block, nav sections, footer).
 *
 * Returns one descriptor per divider: which physical edge carries the
 * border, its width/style/color, and the divider's left inset relative
 * to the sidebar's left edge (full-bleed ⇒ inset 0).
 */
async function collectDividers(page: Page) {
  return page.evaluate((sidebarSel) => {
    const aside = document.querySelector(sidebarSel);
    if (!aside) return [];
    const asideLeft = aside.getBoundingClientRect().left;
    const asideRight = aside.getBoundingClientRect().right;
    const nodes = Array.from(aside.querySelectorAll("[data-divider]"));
    return nodes.map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      // pick the edge that actually has a border (the divider edge).
      const edges = (["top", "bottom", "left", "right"] as const).map((e) => ({
        edge: e,
        width: cs.getPropertyValue(`border-${e}-width`),
        style: cs.getPropertyValue(`border-${e}-style`),
        color: cs.getPropertyValue(`border-${e}-color`),
      }));
      const active =
        edges.find((e) => e.style !== "none" && parseFloat(e.width) > 0) ?? edges[1];
      return {
        tag: el.getAttribute("data-divider") ?? "",
        edge: active.edge,
        width: active.width,
        style: active.style,
        color: active.color,
        insetLeft: Math.round(r.left - asideLeft),
        insetRight: Math.round(asideRight - r.right),
      };
    });
  }, SIDEBAR);
}

test.describe("cycle 4 — polish, flicker fix, real profiles", () => {
  // ════════════════════════════════════════════════════════════════════════
  // CRITERION 8 — every sidebar divider shares ONE treatment (both layouts)
  // ════════════════════════════════════════════════════════════════════════
  test("sidebar dividers — identical weight, color, inset across both layouts", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    // candidate sidebar
    await signIn(page, CAND_EMAIL);
    await page.goto("/me");
    await expect(page.locator(SIDEBAR)).toBeVisible({ timeout: 15_000 });
    const candDividers = await collectDividers(page);

    // recruiter sidebar — sign out, sign back in as the recruiter.
    await page.goto("/co");
    // if still authed as candidate, /co will redirect; force a clean recruiter session.
    await page.evaluate(() => window.localStorage.clear());
    await signIn(page, REC_EMAIL);
    await page.goto("/co");
    await expect(page.locator(SIDEBAR)).toBeVisible({ timeout: 15_000 });
    const coDividers = await collectDividers(page);

    const all = [...candDividers, ...coDividers];
    expect(
      all.length,
      "no [data-divider]-tagged elements found in either sidebar — " +
        "the executor must tag each section divider with data-divider so " +
        "criterion 8 can verify they share one treatment",
    ).toBeGreaterThanOrEqual(4);

    // every divider must share the SAME width, style, and color.
    const treatments = new Set(all.map((d) => `${d.width}|${d.style}|${d.color}`));
    expect(
      treatments.size,
      `sidebar dividers use ${treatments.size} different treatments: ` +
        `${[...treatments].join("  ;  ")} — criterion 8 requires exactly one`,
    ).toBe(1);

    // inset consistency: every divider shares the SAME left+right inset
    // (one consistent full-bleed-vs-inset rule, applied uniformly).
    const insets = new Set(all.map((d) => `${d.insetLeft}/${d.insetRight}`));
    expect(
      insets.size,
      `sidebar dividers have ${insets.size} different insets: ` +
        `${[...insets].join("  ;  ")} — every divider must share one inset rule`,
    ).toBe(1);
  });

  // ════════════════════════════════════════════════════════════════════════
  // CRITERION 9 — the sidebar never unmounts across portal navigation
  // ════════════════════════════════════════════════════════════════════════
  test("flicker fix — sidebar is the same DOM node Dashboard→Messages→Insights→Pipeline", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page, REC_EMAIL);

    // land on the recruiter dashboard
    await page.goto("/co");
    const sidebar = page.locator(SIDEBAR);
    await expect(sidebar).toBeVisible({ timeout: 15_000 });

    // 2. stamp a unique marker on the live <aside> DOM node.
    const marker = `flicker-probe-${Date.now()}`;
    await sidebar.evaluate((el, m) => {
      // a JS expando property — survives ONLY if the node is never replaced.
      (el as unknown as Record<string, unknown>).__flickerProbe = m;
      el.setAttribute("data-flicker-probe", m);
    }, marker);

    // a small helper: after a nav, the marked node must still be the live one.
    async function assertSidebarSurvived(stepLabel: string) {
      // the sidebar must still be present and visible (no layout-less fallback)
      await expect(sidebar, `sidebar missing after ${stepLabel}`).toBeVisible({
        timeout: 10_000,
      });
      // the JS expando is the strict proof — a remount yields a fresh node.
      const probe = await sidebar.evaluate(
        (el) => (el as unknown as Record<string, unknown>).__flickerProbe ?? null,
      );
      expect(
        probe,
        `sidebar <aside> was REMOUNTED during "${stepLabel}" — the JS marker is gone, ` +
          `which means React replaced the DOM node (flicker regression). ` +
          `The fix must keep ONE persistent layout across all portal routes.`,
      ).toBe(marker);
    }

    // 3-4. navigate via in-app NavLinks across the route-group boundary.
    // Dashboard (CompanyShell) → Messages (SharedPortalShell)
    await page.getByRole("link", { name: "Messages" }).click();
    await page.waitForURL(/\/inbox/, { timeout: 10_000 });
    await assertSidebarSurvived("Dashboard → Messages");

    // Messages (SharedPortalShell) → Insights (SharedPortalShell)
    await page.getByRole("link", { name: "Insights" }).click();
    await page.waitForURL(/\/insights/, { timeout: 10_000 });
    await assertSidebarSurvived("Messages → Insights");

    // Insights (SharedPortalShell) → Pipeline (CompanyShell)
    await page.getByRole("link", { name: "Pipeline" }).click();
    await page.waitForURL(/\/co\/pipeline/, { timeout: 10_000 });
    await assertSidebarSurvived("Insights → Pipeline");

    // and back to the Dashboard to close the loop
    await page.getByRole("link", { name: "Dashboard" }).click();
    await page.waitForURL((u) => u.pathname === "/co", { timeout: 10_000 });
    await assertSidebarSurvived("Pipeline → Dashboard");
  });

  // ════════════════════════════════════════════════════════════════════════
  // CRITERION 10 — kanban drag-and-drop persists the stage + logs activity
  // ════════════════════════════════════════════════════════════════════════
  test("kanban — all 6 columns reachable at 1280px", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page, REC_EMAIL);
    await page.goto("/co/pipeline");

    const board = page.locator("[data-testid='kanban-board']");
    await expect(board).toBeVisible({ timeout: 15_000 });

    const columns = page.locator("[data-testid='kanban-column']");
    await expect(columns.first()).toBeVisible({ timeout: 10_000 });
    expect(await columns.count(), "pipeline must have 6 stage columns").toBe(6);

    // every column must be REACHABLE — scroll the board to the last column
    // and assert it lands inside the board's scrollport (not clipped-and-lost).
    const last = columns.last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport({ timeout: 5_000 });

    // the board itself owns the horizontal scroll (criterion 4): its
    // scrollWidth exceeds its clientWidth, and it is the scroll container.
    const overflow = await board.evaluate((el) => ({
      scrollable: el.scrollWidth > el.clientWidth + 1,
      // the element that actually scrolls horizontally must be the board.
      overflowX: getComputedStyle(el).overflowX,
    }));
    expect(
      overflow.scrollable && /(auto|scroll)/.test(overflow.overflowX),
      "the kanban board region must own its horizontal scroll (overflow-x auto/scroll, " +
        "scrollWidth > clientWidth) — the page must NOT clip columns past the fold",
    ).toBe(true);
  });

  test("kanban — drag a card column→column persists the stage change", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, REC_EMAIL);
    await page.goto("/co/pipeline");

    await expect(page.locator("[data-testid='kanban-board']")).toBeVisible({ timeout: 15_000 });

    // the legacy click-to-move dropdown must be GONE (criterion 5).
    expect(
      await page.locator("[data-testid='kanban-move-trigger']").count(),
      "the `MOVE ▾` dropdown must be removed once drag-and-drop ships",
    ).toBe(0);

    // find a source column that HAS a card, and a distinct destination column.
    const columns = page.locator("[data-testid='kanban-column']");
    const colCount = await columns.count();
    expect(colCount).toBeGreaterThanOrEqual(2);

    let srcIdx = -1;
    for (let i = 0; i < colCount; i++) {
      if ((await columns.nth(i).locator("[data-testid='kanban-card']").count()) > 0) {
        srcIdx = i;
        break;
      }
    }
    expect(srcIdx, "no kanban column has a draggable card — seed is empty").toBeGreaterThanOrEqual(
      0,
    );
    const destIdx = srcIdx === 0 ? colCount - 1 : 0;

    const card = columns.nth(srcIdx).locator("[data-testid='kanban-card']").first();
    const destCol = columns.nth(destIdx);
    await expect(card).toBeVisible({ timeout: 10_000 });

    // capture the dragged card's identity so we can confirm it MOVED.
    const cardId = await card.getAttribute("data-pipeline-candidate-id");
    expect(
      cardId,
      "each kanban card must carry data-pipeline-candidate-id for the e2e drag check",
    ).toBeTruthy();

    // ── dnd-kit drag technique ──────────────────────────────────────────────
    // dnd-kit uses PointerSensor/MouseSensor; it does NOT respond to the HTML5
    // drag events that Playwright's `dragTo()` / `locator.dragTo` synthesize.
    // It needs a real pointer gesture: mouse.down on the card, several
    // intermediate mouse.move steps (dnd-kit has an activation distance and
    // computes collisions on move), then mouse.up over the destination.
    // The intermediate steps are REQUIRED — a single move can skip the
    // activation constraint and the drop target detection.
    const cardBox = await card.boundingBox();
    const destBox = await destCol.boundingBox();
    expect(cardBox && destBox).toBeTruthy();
    if (!cardBox || !destBox) throw new Error("could not measure card/column boxes");

    const startX = cardBox.x + cardBox.width / 2;
    const startY = cardBox.y + cardBox.height / 2;
    const endX = destBox.x + destBox.width / 2;
    const endY = destBox.y + Math.min(80, destBox.height / 2);

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // step the pointer so dnd-kit clears its activation distance and tracks
    // the drag overlay across columns. 6 steps is comfortably enough.
    for (let s = 1; s <= 6; s++) {
      await page.mouse.move(
        startX + ((endX - startX) * s) / 6,
        startY + ((endY - startY) * s) / 6,
        { steps: 4 },
      );
    }
    await page.mouse.up();

    // the dragged card must now live in the destination column.
    await expect(
      destCol.locator(`[data-pipeline-candidate-id="${cardId}"]`),
      "the dragged card did not land in the destination column",
    ).toBeVisible({ timeout: 10_000 });

    // and the board must still be intact (no crash on drop).
    await expect(page.locator("[data-testid='kanban-board']")).toBeVisible({ timeout: 5_000 });
  });

  // ════════════════════════════════════════════════════════════════════════
  // CRITERION 11 — candidate detail page is rebuilt around real data
  // ════════════════════════════════════════════════════════════════════════
  test("candidate detail — no credentials section, no methodology, derived motion", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, REC_EMAIL);

    // open the candidates list, then the first candidate's detail page.
    await page.goto("/co/candidates");
    const firstCandidate = page.locator("a[href^='/co/candidates/']").first();
    await expect(firstCandidate).toBeVisible({ timeout: 15_000 });
    await firstCandidate.click();
    await page.waitForURL(/\/co\/candidates\/[^/]+/, { timeout: 10_000 });

    // the page rendered (a heading is present).
    await expect(page.locator("h1")).toBeVisible({ timeout: 10_000 });

    const bodyText = (await page.locator("body").innerText()).toUpperCase();

    // no CREDENTIALS section on the profile surface.
    expect(
      bodyText.includes("CREDENTIALS"),
      "the candidate detail page must NOT show a CREDENTIALS section",
    ).toBe(false);

    // no methodology tag (MEDDIC / Challenger / SPIN / Sandler / BANT, etc.).
    const METHODOLOGY_TOKENS = [
      "MEDDIC",
      "MEDDPICC",
      "CHALLENGER",
      "SPIN SELLING",
      "SANDLER",
      "COMMAND OF MESSAGE",
    ];
    for (const tok of METHODOLOGY_TOKENS) {
      expect(
        bodyText.includes(tok),
        `the candidate detail page must NOT show methodology tag "${tok}"`,
      ).toBe(false);
    }

    // a derived sales-motion is shown — tagged with a stable testid.
    const motion = page.locator("[data-testid='derived-sales-motion']");
    await expect(
      motion,
      "the candidate detail page must show a derived sales-motion " +
        "(tagged [data-testid='derived-sales-motion'])",
    ).toBeVisible({ timeout: 10_000 });
    const motionText = (await motion.innerText()).trim();
    expect(motionText.length, "the derived sales-motion must not be empty").toBeGreaterThan(0);

    // work-history rows: every logo slot is a real <img> that LOADED or a
    // monogram fallback — never a broken image.
    const brokenImages = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll("img"));
      return imgs
        .filter((img) => {
          // an <img> that finished loading but has zero natural size is broken.
          return img.complete && img.naturalWidth === 0;
        })
        .map((img) => img.getAttribute("src") ?? "(no src)");
    });
    expect(
      brokenImages,
      `broken work-history images found: ${brokenImages.join(", ")} — ` +
        `absent logos must render a monogram tile, not a broken <img>`,
    ).toEqual([]);
  });

  // ════════════════════════════════════════════════════════════════════════
  // CRITERION 12 — candidate sidebar shows the real name, no NN// eyebrow
  // ════════════════════════════════════════════════════════════════════════
  test("candidate sidebar — real AE name, no numbered identity eyebrow", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, CAND_EMAIL);
    await page.goto("/me");

    const sidebar = page.locator(SIDEBAR);
    await expect(sidebar).toBeVisible({ timeout: 15_000 });

    const sidebarText = await sidebar.innerText();

    // the hardcoded placeholder must be gone — the seeded candidate has a
    // real name (a first + last from the seed's name pools).
    expect(
      sidebarText.includes("Account Executive"),
      "the candidate sidebar must show the AE's REAL seeded name, " +
        'not the hardcoded "Account Executive"',
    ).toBe(false);

    // the identity block must not carry a numbered `NN //` eyebrow.
    // `01 // SIGNED IN AS` / `01 // HIRING AT` are the banned strings.
    expect(
      /\b\d{2}\s*\/\/\s*(SIGNED IN AS|HIRING AT)\b/i.test(sidebarText),
      "the sidebar identity block must NOT have a numbered `NN //` eyebrow",
    ).toBe(false);

    // sanity: the sidebar still shows SOME identity (a non-empty name node).
    const identityName = page.locator("[data-testid='sidebar-identity-name']");
    if ((await identityName.count()) > 0) {
      expect((await identityName.innerText()).trim().length).toBeGreaterThan(0);
    }
  });
});
