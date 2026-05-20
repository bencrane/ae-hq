#!/usr/bin/env tsx
/**
 * check-kanban-width.ts
 *
 * Criterion 14 verifier for /scope cycle `ae-hq-jobs-as-objects`.
 *
 * This is the RIGOROUS replacement for the cycle-4 kanban check, which only
 * counted columns and asserted "the board scrolls" — a board with six 176px
 * columns passes that and is still cramped, label-truncated, and clips its
 * 6th column. Cycle 4 shipped exactly that. This check measures the RENDERED
 * geometry of the live per-job kanban board and fails any regression below a
 * readable column width.
 *
 * It signs in as the seeded recruiter, discovers a job posting that has
 * applicants (via the company-jobs API), navigates to that job's per-job
 * pipeline (`/co/jobs/:id`), and asserts — all at a 1280px viewport:
 *
 *   1. The board region exists (`[data-testid="kanban-board"]`) and has
 *      >= 2 stage columns (`[data-testid="kanban-column"]`).
 *
 *   2. EVERY column's rendered width (getBoundingClientRect().width) is
 *      >= MIN_COL_PX (280). This is the core anti-176px assertion — it
 *      reads the ACTUAL painted width, not a class name, so a `w-[176px]`,
 *      a flex-shrink that squeezes columns, or a `calc()` that divides the
 *      viewport by six all fail here.
 *
 *   3. The BOARD element is the horizontal scroll container: its
 *      `scrollWidth > clientWidth` (the column track overflows) AND its
 *      computed `overflow-x` is `auto` or `scroll`. A board whose columns
 *      were shrunk to all-fit has scrollWidth == clientWidth and FAILS (2)
 *      already; this additionally rejects the inverse cheat — wide columns
 *      that overflow the *page* because the board itself does not scroll.
 *
 *   4. No column is clipped-and-unreachable: scroll the board fully right,
 *      assert the LAST column's right edge is within the board's padded
 *      client box (it can be reached and fully seen, not lost past the fold).
 *
 *   5. Primary labels are not truncated: for a sample of applicant cards,
 *      the card's primary-label element has `scrollWidth <= clientWidth + 1`
 *      (its text is not overflow-clipped). The label element carries
 *      `[data-testid="kanban-card-label"]`. If no card carries that testid
 *      the check FAILS LOUD — a silent skip is how cycle 4's truncation
 *      slipped through.
 *
 * The check drives the board through the SAME APIs the executor must ship,
 * so it cannot pass against a stub.
 *
 * Required env:
 *   APP_URL                (default http://localhost:5173)
 *   API_URL                (default http://localhost:8080)
 *   AE_SUPABASE_URL | VITE_SUPABASE_URL
 *   AE_SUPABASE_ANON_KEY | VITE_SUPABASE_PUBLISHABLE_KEY
 *   TEST_RECRUITER_EMAIL   (default recruiter1@stripe.test)
 *   TEST_PASSWORD          (default testing123!)
 *
 * Exit codes:
 *   0 — kanban geometry sound (columns >= 280px, board owns scroll, no clip,
 *       labels not truncated)
 *   1 — at least one geometry assertion failed
 *   2 — could not authenticate / no job-with-applicants / page never rendered
 */

import { chromium, type Browser, type Page } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:5173";
const API_URL = process.env.API_URL ?? "http://localhost:8080";
const SUPABASE_URL = process.env.AE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const ANON_KEY =
  process.env.AE_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const REC_EMAIL = process.env.TEST_RECRUITER_EMAIL ?? "recruiter1@stripe.test";
const PASSWORD = process.env.TEST_PASSWORD ?? "testing123!";

/** Minimum readable column width. The directive's K fix says ~280–300px. */
const MIN_COL_PX = 280;
const VIEWPORT = { width: 1280, height: 900 };

let failed = false;
function fail(msg: string) {
  console.error(`  FAIL  ${msg}`);
  failed = true;
}
function ok(msg: string) {
  console.log(`  ok    ${msg}`);
}

if (!SUPABASE_URL || !ANON_KEY) {
  console.error("FAIL: AE_SUPABASE_URL / AE_SUPABASE_ANON_KEY not set (source .env.local)");
  process.exit(2);
}

/** Supabase password grant — returns a recruiter access token. */
async function mintToken(): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY as string },
    body: JSON.stringify({ email: REC_EMAIL, password: PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`auth failed (${res.status}) for ${REC_EMAIL}: ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("auth response had no access_token");
  return json.access_token;
}

/**
 * Discover a job posting that HAS applicants, so the per-job board is
 * non-empty. Uses the cycle-5 company-jobs endpoint; an entry must expose a
 * job id and a positive applicant count. The exact response shape is the
 * executor's, so we probe defensively for the id + count fields.
 */
async function findJobWithApplicants(token: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/v1/company/jobs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`GET /api/v1/company/jobs failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as unknown;
  const rows: Record<string, unknown>[] = Array.isArray(body)
    ? (body as Record<string, unknown>[])
    : Array.isArray((body as { jobs?: unknown[] })?.jobs)
      ? ((body as { jobs: Record<string, unknown>[] }).jobs)
      : Array.isArray((body as { data?: unknown[] })?.data)
        ? ((body as { data: Record<string, unknown>[] }).data)
        : [];
  if (rows.length === 0) throw new Error("GET /api/v1/company/jobs returned no postings");

  const countOf = (r: Record<string, unknown>): number => {
    for (const k of ["applicant_count", "applicantCount", "applicants", "total", "count"]) {
      const v = r[k];
      if (typeof v === "number") return v;
    }
    // a funnel summary array of {stage,count} also tells us the total
    for (const k of ["funnel", "funnel_summary", "funnelSummary", "stages"]) {
      const v = r[k];
      if (Array.isArray(v)) {
        return v.reduce((s, e) => s + (typeof e?.count === "number" ? e.count : 0), 0);
      }
    }
    return 0;
  };
  const idOf = (r: Record<string, unknown>): string | null => {
    for (const k of ["id", "job_id", "jobId"]) {
      const v = r[k];
      if (typeof v === "string" && v.length > 0) return v;
    }
    const nested = r["job"];
    if (nested && typeof nested === "object") {
      const v = (nested as Record<string, unknown>)["id"];
      if (typeof v === "string") return v;
    }
    return null;
  };

  const withApplicants = rows.filter((r) => countOf(r) > 0);
  const pick = withApplicants[0] ?? rows[0];
  const id = idOf(pick);
  if (!id) throw new Error("could not extract a job id from /api/v1/company/jobs response");
  if (withApplicants.length === 0) {
    // not fatal for geometry, but the label/clip checks want cards present
    console.error("  note  no posting reported applicants — board may be sparse");
  }
  return id;
}

async function signIn(page: Page) {
  await page.goto(`${APP_URL}/signin`);
  await page.locator('input[type="email"]').fill(REC_EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 20_000 });
}

async function main() {
  const token = await mintToken();
  const jobId = await findJobWithApplicants(token);
  ok(`per-job pipeline target: /co/jobs/${jobId}`);

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: VIEWPORT });
    await signIn(page);
    await page.goto(`${APP_URL}/co/jobs/${jobId}`);

    const board = page.locator("[data-testid='kanban-board']");
    try {
      await board.waitFor({ state: "visible", timeout: 15_000 });
    } catch {
      fail(`/co/jobs/${jobId} never rendered a [data-testid="kanban-board"]`);
      await browser.close();
      console.error("\nFAIL: per-job kanban board did not render");
      process.exit(2);
    }

    const columns = page.locator("[data-testid='kanban-column']");
    const colCount = await columns.count();
    if (colCount < 2) {
      fail(`expected >= 2 kanban columns, found ${colCount}`);
    } else {
      ok(`${colCount} stage columns rendered`);
    }

    // ── 2. every column >= MIN_COL_PX wide (rendered) ────────────────────────
    let narrowest = Infinity;
    for (let i = 0; i < colCount; i++) {
      const box = await columns.nth(i).boundingBox();
      const w = box?.width ?? 0;
      narrowest = Math.min(narrowest, w);
    }
    if (narrowest >= MIN_COL_PX) {
      ok(`narrowest column is ${Math.round(narrowest)}px (>= ${MIN_COL_PX}px)`);
    } else {
      fail(
        `a kanban column rendered at ${Math.round(narrowest)}px — below the ${MIN_COL_PX}px ` +
          `readable minimum (cycle-4 regression: columns shrunk to fit a wide-viewport drag e2e)`,
      );
    }

    // ── 3. the BOARD owns the horizontal scroll ──────────────────────────────
    const overflow = await board.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      overflowX: getComputedStyle(el).overflowX,
    }));
    const boardScrolls =
      overflow.scrollWidth > overflow.clientWidth + 1 &&
      /(auto|scroll)/.test(overflow.overflowX);
    if (boardScrolls) {
      ok(
        `board owns horizontal scroll (scrollWidth ${overflow.scrollWidth} > ` +
          `clientWidth ${overflow.clientWidth}, overflow-x: ${overflow.overflowX})`,
      );
    } else {
      // With >=280px columns and >=2 of them at 1280px the track exceeds the
      // board's content box, so the board MUST overflow. If it does not, the
      // columns were squeezed (caught by #2) or the page — not the board —
      // is the scroll container.
      fail(
        `the kanban board region must own its horizontal scroll ` +
          `(overflow-x auto/scroll AND scrollWidth > clientWidth); got ` +
          `scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth} ` +
          `overflow-x=${overflow.overflowX}`,
      );
    }

    // ── 4. last column is reachable + fully visible after scrolling right ────
    if (colCount >= 2) {
      await board.evaluate((el) => {
        el.scrollLeft = el.scrollWidth;
      });
      // let the scroll settle
      await page.waitForTimeout(250);
      const reach = await board.evaluate((el) => {
        const lastCol = el.querySelectorAll("[data-testid='kanban-column']");
        const last = lastCol[lastCol.length - 1] as HTMLElement | undefined;
        if (!last) return null;
        const boardBox = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const padR = parseFloat(cs.paddingRight) || 0;
        const padL = parseFloat(cs.paddingLeft) || 0;
        const colBox = last.getBoundingClientRect();
        return {
          // the last column's right edge sits within the board's padded box
          rightInside: colBox.right <= boardBox.right - padR + 2,
          leftInside: colBox.left >= boardBox.left + padL - 2,
          colWidth: colBox.width,
          visible: colBox.width > 0 && colBox.height > 0,
        };
      });
      if (!reach) {
        fail("could not locate the last kanban column after scrolling");
      } else if (reach.rightInside && reach.leftInside && reach.visible) {
        ok(`last column fully reachable + visible after scroll-right (${Math.round(reach.colWidth)}px)`);
      } else {
        fail(
          `last kanban column is clipped/unreachable after scrolling the board fully right ` +
            `(rightInside=${reach.rightInside} leftInside=${reach.leftInside} ` +
            `visible=${reach.visible}) — a column past the fold the recruiter cannot see`,
        );
      }
    }

    // ── 5. card primary labels are not truncated ─────────────────────────────
    const labels = page.locator("[data-testid='kanban-card-label']");
    const labelCount = await labels.count();
    if (labelCount === 0) {
      fail(
        `no [data-testid="kanban-card-label"] found — the applicant card's primary ` +
          `label must carry this testid so truncation is verifiable (cycle-4 truncation ` +
          `slipped through because nothing measured it). Either the board has no cards ` +
          `or the label is untagged; both fail this criterion.`,
      );
    } else {
      const sample = Math.min(labelCount, 12);
      let truncated = 0;
      for (let i = 0; i < sample; i++) {
        const t = await labels.nth(i).evaluate((el) => ({
          scrollW: el.scrollWidth,
          clientW: el.clientWidth,
          text: (el.textContent ?? "").trim().slice(0, 40),
        }));
        if (t.scrollW > t.clientW + 1) {
          truncated++;
          console.error(`        truncated label: "${t.text}" (${t.scrollW}>${t.clientW})`);
        }
      }
      if (truncated === 0) {
        ok(`${sample} sampled card label(s) render without truncation`);
      } else {
        fail(
          `${truncated}/${sample} applicant-card primary labels are overflow-truncated — ` +
            `columns are too narrow OR the label is clipped`,
        );
      }
    }

    await browser.close();
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    console.error(`FAIL: kanban-width check threw: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  }

  if (failed) {
    console.error("\nFAIL: kanban geometry is not sound");
    process.exit(1);
  }
  console.log(
    `OK: per-job kanban — columns >= ${MIN_COL_PX}px, board owns scroll, ` +
      `no clipped column, labels not truncated`,
  );
  process.exit(0);
}

main();
