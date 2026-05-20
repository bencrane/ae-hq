// Cycle-4 seed — company firmographics (sales motion, founding year, investors,
// employee count) for all 20 seeded companies.
//
// The `companies` table is truncated and reinserted by the main seed (index.ts).
// This module runs RIGHT AFTER that insert loop and UPDATEs each company with its
// firmographic data — keeping cycle-4 firmographic logic in its own module
// (mirroring the seed/cycle-3.ts pattern) without rewriting the companies insert.
//
// Idempotency: this is a plain UPDATE keyed on slug. Re-running it (the verifier
// runs `bun run seed` twice) sets the same values — no row churn, no count change.
//
// Sales motion is one of: plg | sales_led | enterprise | hybrid. It must be
// non-null for ALL 20 companies before any candidate sales-motion can be derived
// (validator prediction p3). Investor names are REAL VC firms so the investor
// dimension is testable in cycle 6.

import type postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

export type SalesMotion = "plg" | "sales_led" | "enterprise" | "hybrid";

export type CompanyFirmographics = {
  sales_motion: SalesMotion;
  founded_year: number;
  employee_count: number;
  investors: string[];
};

// Firmographics for every seeded company, keyed by slug. Real-shaped data:
// founding years and investor lists reflect each company's actual history;
// sales_motion reflects how the company is widely understood to sell.
export const COMPANY_FIRMOGRAPHICS: Record<string, CompanyFirmographics> = {
  stripe: {
    sales_motion: "hybrid",
    founded_year: 2010,
    employee_count: 8500,
    investors: ["Sequoia Capital", "Andreessen Horowitz", "General Catalyst", "Founders Fund"],
  },
  snowflake: {
    sales_motion: "enterprise",
    founded_year: 2012,
    employee_count: 7000,
    investors: ["Sutter Hill Ventures", "Sequoia Capital", "Altimeter Capital", "Iconiq Growth"],
  },
  mongodb: {
    sales_motion: "hybrid",
    founded_year: 2007,
    employee_count: 5000,
    investors: ["Sequoia Capital", "Flybridge Capital Partners", "Union Square Ventures"],
  },
  datadog: {
    sales_motion: "sales_led",
    founded_year: 2010,
    employee_count: 7500,
    investors: ["Index Ventures", "OpenView Venture Partners", "ICONIQ Growth"],
  },
  hashicorp: {
    sales_motion: "hybrid",
    founded_year: 2012,
    employee_count: 2200,
    investors: ["Mayfield Fund", "GGV Capital", "Bessemer Venture Partners", "Redpoint Ventures"],
  },
  plaid: {
    sales_motion: "sales_led",
    founded_year: 2013,
    employee_count: 1200,
    investors: ["Andreessen Horowitz", "Index Ventures", "Kleiner Perkins", "Spark Capital"],
  },
  vercel: {
    sales_motion: "plg",
    founded_year: 2015,
    employee_count: 500,
    investors: ["Accel", "GV", "Bedrock Capital", "Geodesic Capital"],
  },
  linear: {
    sales_motion: "plg",
    founded_year: 2019,
    employee_count: 120,
    investors: ["Sequoia Capital", "Accel", "Index Ventures"],
  },
  notion: {
    sales_motion: "plg",
    founded_year: 2013,
    employee_count: 800,
    investors: ["Index Ventures", "Sequoia Capital", "Coatue Management"],
  },
  anthropic: {
    sales_motion: "enterprise",
    founded_year: 2021,
    employee_count: 900,
    investors: ["Spark Capital", "Google", "Lightspeed Venture Partners", "Menlo Ventures"],
  },
  openai: {
    sales_motion: "enterprise",
    founded_year: 2015,
    employee_count: 3000,
    investors: ["Khosla Ventures", "Thrive Capital", "Microsoft", "Andreessen Horowitz"],
  },
  ramp: {
    sales_motion: "sales_led",
    founded_year: 2019,
    employee_count: 900,
    investors: ["Founders Fund", "Khosla Ventures", "Thrive Capital", "Stripe"],
  },
  brex: {
    sales_motion: "sales_led",
    founded_year: 2017,
    employee_count: 1100,
    investors: ["Y Combinator", "Ribbit Capital", "DST Global", "Greenoaks Capital"],
  },
  mercury: {
    sales_motion: "plg",
    founded_year: 2017,
    employee_count: 700,
    investors: ["Andreessen Horowitz", "CRV", "Coatue Management"],
  },
  retool: {
    sales_motion: "hybrid",
    founded_year: 2017,
    employee_count: 500,
    investors: ["Sequoia Capital", "Y Combinator", "GIC", "Altimeter Capital"],
  },
  render: {
    sales_motion: "plg",
    founded_year: 2018,
    employee_count: 110,
    investors: ["General Catalyst", "Bessemer Venture Partners", "Addition"],
  },
  modal: {
    sales_motion: "plg",
    founded_year: 2021,
    employee_count: 60,
    investors: ["Redpoint Ventures", "Amplify Partners", "Lux Capital"],
  },
  replit: {
    sales_motion: "plg",
    founded_year: 2016,
    employee_count: 250,
    investors: ["Andreessen Horowitz", "Khosla Ventures", "Coatue Management", "Y Combinator"],
  },
  cursor: {
    sales_motion: "plg",
    founded_year: 2022,
    employee_count: 80,
    investors: ["Andreessen Horowitz", "Thrive Capital", "OpenAI Startup Fund"],
  },
  supabase: {
    sales_motion: "plg",
    founded_year: 2020,
    employee_count: 130,
    investors: ["Y Combinator", "Coatue Management", "Felicis Ventures", "Craft Ventures"],
  },
};

/**
 * Apply firmographic data to every seeded company. Idempotent — a plain UPDATE
 * keyed on slug; re-running sets identical values and never changes row counts.
 *
 * Returns the number of companies updated. Throws if a seeded company has no
 * firmographic entry (every one of the 20 seed slugs MUST be covered — an
 * untagged company breaks candidate sales-motion derivation, prediction p3).
 */
export async function applyCompanyFirmographics(sql: Sql): Promise<{ updated: number }> {
  const companies = await sql<{ slug: string }[]>`select slug from public.companies`;
  let updated = 0;
  for (const { slug } of companies) {
    const f = COMPANY_FIRMOGRAPHICS[slug];
    if (!f) {
      throw new Error(
        `cycle-4 seed: company "${slug}" has no firmographic entry — ` +
          `every seeded company must be covered (sales-motion derivation depends on it)`,
      );
    }
    await sql`
      update public.companies
      set sales_motion = ${f.sales_motion},
          founded_year = ${f.founded_year},
          employee_count = ${f.employee_count},
          investors = ${f.investors}
      where slug = ${slug}
    `;
    updated++;
  }
  return { updated };
}
