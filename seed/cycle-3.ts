// Cycle-3 seed — articles (Carrying Quota editorial), pipeline stages/candidates,
// conversations + message threads, pipeline activity.
//
// Idempotency: the cycle-3 tables are truncated at the top of the main seed, so
// this module always inserts a fresh, deterministic set. messages and
// pipeline_activity have no natural unique key — truncate-and-reseed is the
// strategy (validator prediction on seed idempotency).

import type postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

// ─────────────── Carrying Quota articles ───────────────

type ArticleSeed = {
  kind: "company_spotlight" | "compensation_data" | "leadership_moves";
  slug: string;
  title: string;
  dek: string;
  author: string;
  readMinutes: number;
  tags: string[];
  body: string;
};

const ARTICLES: ArticleSeed[] = [
  {
    kind: "company_spotlight",
    slug: "stripe-enterprise-motion-2026",
    title: "Inside Stripe's Enterprise Motion",
    dek: "How the payments giant rebuilt its enterprise sales org around outcome-based selling — and what AEs on the team actually carry.",
    author: "Dana Whitfield",
    readMinutes: 7,
    tags: ["Stripe", "Enterprise", "Payments"],
    body: "## The shift\n\nStripe spent 2025 quietly **re-architecting** its enterprise go-to-market. Where the company once led with developer love and bottoms-up adoption, the enterprise org now runs a disciplined, multi-threaded motion.\n\n### What changed\n\n- Quotas moved from logo count to *net revenue retention* contribution.\n- Every enterprise AE now pairs with a solutions architect from first call.\n- Deal desks were given veto power on discounting.\n\n> \"We stopped rewarding the close and started rewarding the expansion,\" one sales leader told us.\n\n## What AEs carry\n\nA senior enterprise AE at Stripe today carries a number in the **high six figures** of quota, with accelerators that kick in past 100%. Average deal cycles run 90 to 140 days. The role is unambiguously consultative — the days of transactional payments deals are over.\n\nFor AEs evaluating the move, the signal is clear: this is a seat for someone who can run a room of eight stakeholders and still know the unit economics cold.",
  },
  {
    kind: "company_spotlight",
    slug: "snowflake-land-and-expand-playbook",
    title: "Snowflake's Land-and-Expand Playbook, Decoded",
    dek: "The data-cloud company turned consumption pricing into a sales superpower. We break down the AE comp model behind it.",
    author: "Marcus Reide",
    readMinutes: 6,
    tags: ["Snowflake", "Consumption", "Data"],
    body: "## Consumption changes everything\n\nWhen revenue is metered by usage, the sale never really ends. Snowflake built its **entire AE org** around that truth.\n\n### The mechanics\n\nAn AE lands a workload, then the customer-success motion drives consumption. The AE's number is tied to *consumed* credits, not booked contract value — so a great AE is one whose accounts keep growing six months after signature.\n\n## Comp implications\n\nThis creates an unusual comp dynamic:\n\n- Base salaries sit slightly below market.\n- On-target earnings are high, but realized earnings are *variable*.\n- Top performers compound — their book grows even while they sleep.\n\nIt rewards patience and account depth over hunting. AEs who thrive here treat every account like a portfolio position.",
  },
  {
    kind: "company_spotlight",
    slug: "ramp-velocity-sales-culture",
    title: "Ramp and the Velocity Sales Culture",
    dek: "Inside the fastest-growing fintech's sales floor, where speed is a feature and the demo is the pitch.",
    author: "Priya Anand",
    readMinutes: 5,
    tags: ["Ramp", "Fintech", "Velocity"],
    body: "## Speed as strategy\n\nRamp's sales org is built for **velocity**. The product demos itself; the AE's job is to remove friction and compress time-to-value.\n\n### On the floor\n\n- Discovery and demo collapse into a single 30-minute call.\n- Mutual action plans are sent before the call ends.\n- The median SMB deal closes inside two weeks.\n\n## The AE profile\n\nThis is not a seat for a consultative enterprise seller. Ramp wants AEs who are *relentless*, organized, and comfortable running 12 cycles at once. Comp skews toward high activity and fast accelerators.\n\nIf you measure your week in closed-won and you like a scoreboard, this floor is for you.",
  },
  {
    kind: "company_spotlight",
    slug: "datadog-multi-product-selling",
    title: "Datadog's Multi-Product Selling Machine",
    dek: "Sixteen products, one platform pitch. How Datadog AEs navigate a sprawling portfolio without losing the thread.",
    author: "Tom Becker",
    readMinutes: 6,
    tags: ["Datadog", "Observability", "Platform"],
    body: "## The platform problem\n\nDatadog sells **sixteen-plus products**. The risk: every conversation fragments into a feature tour.\n\n### The fix\n\nDatadog trains AEs to lead with the *platform consolidation* narrative — replace five point tools with one pane of glass. The individual products become proof points, not the pitch.\n\n## What AEs carry\n\nEnterprise AEs at Datadog carry large numbers and long account lists. The motion rewards AEs who can map a customer's tooling sprawl and build a multi-year consolidation roadmap.\n\nIt is one of the most *technical* AE seats in SaaS — expect to know the difference between APM and RUM cold.",
  },
  {
    kind: "company_spotlight",
    slug: "mongodb-developer-led-enterprise",
    title: "MongoDB: Developer-Led, Enterprise-Closed",
    dek: "The database company that lets developers fall in love first, then sends an AE to make it official.",
    author: "Dana Whitfield",
    readMinutes: 5,
    tags: ["MongoDB", "Developer", "Enterprise"],
    body: "## Bottoms-up meets top-down\n\nMongoDB's growth engine is **developer adoption**. Atlas spreads through engineering orgs on its own. The AE arrives once usage is already real.\n\n### The AE's job\n\n- Identify which free-tier accounts have enterprise gravity.\n- Convert grassroots usage into a committed contract.\n- Multi-thread from the engineering champion up to the VP.\n\n## Comp and culture\n\nBecause the product lands itself, MongoDB AEs are *expansion specialists*. The number rewards growing committed spend inside accounts that already use the product.\n\nGreat MongoDB AEs are translators — fluent enough with engineers to be trusted, commercial enough with execs to close.",
  },
  {
    kind: "compensation_data",
    slug: "enterprise-ae-ote-benchmarks-2026",
    title: "2026 Enterprise AE OTE Benchmarks",
    dek: "We aggregated verified compensation data across 1,400 enterprise AE seats. Here is what the market actually pays.",
    author: "AE Data Desk",
    readMinutes: 8,
    tags: ["Compensation", "Enterprise", "Benchmarks"],
    body: "## The headline numbers\n\nAcross **1,400 verified enterprise AE seats**, the median 2026 on-target earnings landed at **$285,000**, split roughly 50/50 base and variable.\n\n### By company stage\n\n| Stage | Median OTE | Base |\n|-------|-----------|------|\n| Series B | $245K | $130K |\n| Series C | $270K | $140K |\n| Series D | $295K | $150K |\n| Public | $310K | $160K |\n\n## What moves the number\n\n- **Deal size** is the single strongest predictor of OTE.\n- Remote seats pay within 4% of in-office seats — the gap has nearly closed.\n- Accelerator structure matters more than headline OTE for top performers.\n\nThe data is clear: chase deal size and accelerator quality, not the OTE on the job post.",
  },
  {
    kind: "compensation_data",
    slug: "smb-ae-comp-reality-check",
    title: "The SMB AE Comp Reality Check",
    dek: "SMB AE roles advertise aggressive OTEs. Verified attainment data tells a more honest story.",
    author: "AE Data Desk",
    readMinutes: 6,
    tags: ["Compensation", "SMB", "Attainment"],
    body: "## The gap between posted and realized\n\nSMB AE job posts love a big OTE. But **realized earnings** depend entirely on attainment — and SMB attainment is volatile.\n\n### What the data shows\n\n- Median posted SMB OTE: $135K.\n- Median *realized* SMB earnings: $108K.\n- Only 38% of SMB AEs hit 100% of quota in 2025.\n\n## Reading a posting honestly\n\nWhen you see a $140K SMB OTE, mentally discount it. Ask about:\n\n1. The team's *average* attainment last year.\n2. Ramp quota relief.\n3. How often quotas are reset upward.\n\nA modest OTE with 70% team attainment beats a flashy OTE with 30%.",
  },
  {
    kind: "compensation_data",
    slug: "accelerator-structures-that-matter",
    title: "Accelerator Structures That Actually Matter",
    dek: "Two AEs with the same OTE can earn 40% apart. The difference is buried in the accelerator schedule.",
    author: "Marcus Reide",
    readMinutes: 5,
    tags: ["Compensation", "Accelerators", "Negotiation"],
    body: "## Why accelerators decide your year\n\nBase and OTE get all the attention in offer talks. But for anyone who beats quota, the **accelerator schedule** is where the real money lives.\n\n### Common structures\n\n- **Flat:** every dollar past quota pays the same rate. Predictable, unexciting.\n- **Stepped:** the rate jumps at 110%, 125%, 150%. Rewards overperformance hard.\n- **Decelerating:** the rate *drops* past a cap. A red flag — avoid.\n\n## What to ask\n\nIn any offer conversation, ask for the full commission plan document. Model your earnings at 80%, 100%, and 130% attainment. If the 130% number does not excite you, the plan is not built for a top performer.",
  },
  {
    kind: "compensation_data",
    slug: "remote-vs-onsite-pay-gap-closed",
    title: "The Remote-vs-Onsite Pay Gap Has Closed",
    dek: "Three years of verified data show remote AE seats now pay within striking distance of in-office roles.",
    author: "AE Data Desk",
    readMinutes: 4,
    tags: ["Compensation", "Remote", "Trends"],
    body: "## A gap that quietly disappeared\n\nIn 2023, remote AE seats paid a visible discount. By **2026, that gap is effectively gone**.\n\n### The numbers\n\n- 2023: remote AE OTE trailed onsite by 11%.\n- 2024: the gap narrowed to 7%.\n- 2026: remote seats pay within **4%** of onsite — inside the noise.\n\n## Why it closed\n\nTalent competition did the work. The best AEs simply refused location discounts, and companies that held the line lost candidates. Today, location is rarely a comp lever for proven sellers.\n\nIf a company quotes you a steep remote discount, treat it as a signal about how they value sellers.",
  },
  {
    kind: "compensation_data",
    slug: "ramp-quota-relief-data",
    title: "Ramp Quota Relief: What the Data Says",
    dek: "Ramp quota relief — the period of reduced quota — varies wildly. We pulled the numbers.",
    author: "Priya Anand",
    readMinutes: 5,
    tags: ["Compensation", "Ramp Quota", "New Roles"],
    body: "## The most underrated offer term\n\nRamp quota relief — the months of reduced quota when you start — can be worth **tens of thousands of dollars**. It is also one of the least negotiated terms.\n\n### What we found\n\n- Median ramp period: 3 months.\n- Best-in-class: 6 months at 50% quota relief.\n- Worst: full quota from week one — a structural disadvantage.\n\n## Negotiating it\n\nRamp relief is often easier to negotiate than base salary because it does not change your steady-state cost to the company. Always ask. A two-month improvement in relief can be the difference between a strong first year and a missed one.",
  },
  {
    kind: "leadership_moves",
    slug: "vp-sales-musical-chairs-q1-2026",
    title: "VP Sales Musical Chairs: Q1 2026",
    dek: "A quarter of unusually heavy sales-leadership movement. Who moved where, and what it signals.",
    author: "Tom Becker",
    readMinutes: 6,
    tags: ["Leadership", "Moves", "Hiring"],
    body: "## A busy quarter\n\nQ1 2026 saw an **unusual volume** of VP Sales and CRO transitions across growth-stage SaaS.\n\n### Notable moves\n\n- A veteran enterprise leader left a public company for a Series C rocket ship.\n- Two CROs swapped industries entirely — fintech to devtools.\n- A wave of first-time VPs were promoted from within rather than hired out.\n\n## What it signals for AEs\n\nLeadership churn is a *double-edged* signal. A new VP often means:\n\n1. New comp plans within two quarters.\n2. Territory reshuffles.\n3. A hiring spree as the leader brings in known talent.\n\nIf you are interviewing somewhere with a new sales leader, ask about their first-100-days plan. It tells you what your next year looks like.",
  },
  {
    kind: "leadership_moves",
    slug: "the-rise-of-the-player-coach-manager",
    title: "The Rise of the Player-Coach Sales Manager",
    dek: "Growth-stage companies increasingly want first-line managers who still carry a bag. AEs should take note.",
    author: "Dana Whitfield",
    readMinutes: 5,
    tags: ["Leadership", "Management", "Career"],
    body: "## A new shape of first-line management\n\nThe pure people-manager is fading at growth stage. Companies now want **player-coaches** — managers who still close deals.\n\n### Why the shift\n\n- Capital efficiency: a manager who carries quota is two hires in one.\n- Credibility: reps trust a manager who is still in the arena.\n- Pipeline: player-coaches keep the team's number honest.\n\n## What it means for your career\n\nFor AEs eyeing management, this is good news and a warning. Good news: the path is *shorter*. Warning: you will not escape the number. The first rung of leadership now means doing both jobs well, at once.\n\nDecide honestly whether that is the job you want.",
  },
  {
    kind: "leadership_moves",
    slug: "founder-led-sales-when-to-hire-ae",
    title: "Founder-Led Sales: When to Hire the First AE",
    dek: "The handoff from founder selling to a real sales team is treacherous. Here is how the best companies time it.",
    author: "Marcus Reide",
    readMinutes: 7,
    tags: ["Leadership", "Founders", "Early Stage"],
    body: "## The hardest handoff in startups\n\nMoving from **founder-led sales** to a repeatable sales team is one of the most failure-prone transitions a startup makes.\n\n### Signs it is time\n\n- The founder has personally closed 10 to 20 deals with a consistent pattern.\n- The pitch is documented and others can deliver it.\n- Inbound exceeds the founder's capacity to respond.\n\n## For the first AE\n\nBeing the first AE is high-risk, high-reward. You inherit a thin playbook and enormous upside. The best first AEs are *builders* — comfortable writing the motion as they sell it.\n\nIf you join too early, you will flail without a playbook. Too late, and the best territory is gone. Read the signs above carefully before you sign.",
  },
  {
    kind: "leadership_moves",
    slug: "sales-org-design-pods-vs-pools",
    title: "Sales Org Design: Pods vs. Pools",
    dek: "How a company structures its sales floor shapes your daily life as an AE. Two dominant models, compared.",
    author: "Priya Anand",
    readMinutes: 6,
    tags: ["Leadership", "Org Design", "Culture"],
    body: "## Two ways to build a floor\n\nMost sales orgs land on one of two structures: **pods** or **pools**.\n\n### The pod model\n\nA pod is a fixed unit — AE, SDR, SE, CSM — working a defined territory together. Tight collaboration, clear ownership, slower to rebalance.\n\n### The pool model\n\nResources are shared. Any SDR can pass to any AE; SEs are a shared bench. More flexible, less accountable, can feel impersonal.\n\n## What it means for you\n\nIn a pod, your SDR's quality *is* your pipeline — vet them in interviews. In a pool, your own prospecting discipline matters more.\n\nAsk which model a company runs before you join. It quietly determines whether you control your own number.",
  },
  {
    kind: "leadership_moves",
    slug: "cro-priorities-shifting-to-efficiency",
    title: "CRO Priorities Are Shifting to Efficiency",
    dek: "The growth-at-all-costs era is over. CROs now optimize for efficient revenue — and AE roles are changing with it.",
    author: "AE Data Desk",
    readMinutes: 5,
    tags: ["Leadership", "Efficiency", "Trends"],
    body: "## From growth to efficiency\n\nThe **growth-at-all-costs** mandate is gone. Today's CRO is measured on *efficient* revenue — magic number, CAC payback, net retention.\n\n### How it reshapes AE roles\n\n- Larger territories per AE — fewer reps, more accountability.\n- Heavier emphasis on expansion and retention, not just new logos.\n- Tighter deal desks and less discounting freedom.\n\n## What AEs should do\n\nIn an efficiency era, the AEs who thrive are those who can tell a *unit-economics* story — to customers and to their own leadership.\n\nKnow your accounts' ROI cold. Be the rep whose deals do not need a discount to close. That is the profile every efficiency-minded CRO is hunting for.",
  },
];

// ─────────────── default pipeline stages (Stripe) ───────────────

const STAGES: { name: string; position: number; color: string; terminal: boolean }[] = [
  { name: "New", position: 0, color: "info", terminal: false },
  { name: "Reviewing", position: 1, color: "default", terminal: false },
  { name: "Phone Screen", position: 2, color: "warn", terminal: false },
  { name: "Onsite", position: 3, color: "accent", terminal: false },
  { name: "Offer", position: 4, color: "good", terminal: false },
  { name: "Closed", position: 5, color: "muted", terminal: true },
];

// ─────────────── conversation thread templates ───────────────

// Each template is a sequence of {from: 'recruiter'|'candidate', body}. The seed
// resolves "from" to the right user_id at insert time.
type ThreadTurn = { from: "recruiter" | "candidate"; body: string };

const THREADS: ThreadTurn[][] = [
  [
    { from: "recruiter", body: "Hi — I came across your background closing enterprise fintech deals. We have a Senior Enterprise AE seat open and I think it could be a strong fit. Open to a quick chat?" },
    { from: "candidate", body: "Thanks for reaching out. I'd be open to learning more. What does the territory and quota look like?" },
    { from: "recruiter", body: "Great. It's a named-account model — roughly 25 strategic accounts, OTE in the high $200s with stepped accelerators. Solutions architect paired from first call." },
    { from: "candidate", body: "That lines up well with what I'm looking for. Could you share more on the ramp quota relief?" },
    { from: "recruiter", body: "Six months at 50% relief — one of the more generous structures on the team. Want me to set up time with the hiring manager this week?" },
    { from: "candidate", body: "Yes, let's do it. Thursday or Friday afternoon works best for me." },
  ],
  [
    { from: "recruiter", body: "Hello! We're building out our mid-market team and your profile stood out. Would you be interested in a conversation?" },
    { from: "candidate", body: "Hi — appreciate the note. I'm casually looking. Can you tell me about the sales motion?" },
    { from: "recruiter", body: "It's a velocity motion — discovery and demo in one call, median cycle under three weeks. High activity, fast accelerators." },
    { from: "candidate", body: "Got it. That's a bit faster-paced than my current seat. What's the team's average attainment?" },
    { from: "recruiter", body: "Team hit 84% on average last year, with the top third over 120%. Happy to walk through the comp plan in detail on a call." },
  ],
  [
    { from: "recruiter", body: "Hi there — your verified attainment numbers are exactly what we look for. We have an Enterprise AE role open. Interested?" },
    { from: "candidate", body: "Thank you — yes, I'd like to hear more. What stage is the company at?" },
    { from: "recruiter", body: "Series D, strong net retention, very deliberate enterprise motion. This is a consultative seat — eight-stakeholder rooms, 90-to-140-day cycles." },
    { from: "candidate", body: "That's my wheelhouse. What's the base/variable split on the OTE?" },
    { from: "recruiter", body: "Roughly 50/50 on a $295K OTE. Accelerators step up at 110 and 125. Shall I get you on the calendar with our VP?" },
    { from: "candidate", body: "Please do. I'm generally free mornings next week." },
    { from: "recruiter", body: "Perfect — sending an invite for Tuesday at 10am. Looking forward to it." },
  ],
  [
    { from: "recruiter", body: "Hi! We're hiring a Strategic Enterprise AE and your background is a great match. Would love to connect." },
    { from: "candidate", body: "Hi — happy to chat. What does the role involve day to day?" },
    { from: "recruiter", body: "Largest accounts, multi-year consolidation roadmaps, deep technical selling. You'd carry a small list of very high-value logos." },
    { from: "candidate", body: "Sounds substantial. How is the team structured — pods or a shared pool?" },
    { from: "recruiter", body: "Pod model — you'd have a dedicated SDR and SE. Tight unit, clear ownership. Want to meet the pod lead?" },
  ],
  [
    { from: "recruiter", body: "Hello — I lead recruiting for our sales org. Your profile is impressive. Open to exploring a new opportunity?" },
    { from: "candidate", body: "Thanks. I'm selectively open. What makes this role worth a move?" },
    { from: "recruiter", body: "New VP of Sales just joined from a public company and is building a first-team. Early seats get the best territory and shape the comp plan." },
    { from: "candidate", body: "That's an interesting window. What's the timeline on the comp plan being finalized?" },
    { from: "recruiter", body: "Within the next quarter. Joining now means you have input. Can I set up an intro call?" },
    { from: "candidate", body: "Yes — let's find time. I'll send over my availability." },
  ],
  [
    { from: "recruiter", body: "Hi — we have an Enterprise AE seat on a multi-product platform team. Your experience navigating complex portfolios caught my eye." },
    { from: "candidate", body: "Appreciate the outreach. I'd like to understand the platform pitch better before we talk." },
    { from: "recruiter", body: "The narrative is consolidation — replace five point tools with one platform. Individual products are proof points, not the pitch." },
    { from: "candidate", body: "Makes sense. Is this primarily a new-logo or an expansion seat?" },
    { from: "recruiter", body: "A healthy mix — about 60% expansion. I can connect you with a current AE to hear their experience." },
  ],
  [
    { from: "recruiter", body: "Hello! We're growing our enterprise team and would love to talk with you about a Senior AE role." },
    { from: "candidate", body: "Hi — thanks. Quick question first: is the seat remote-friendly?" },
    { from: "recruiter", body: "Fully remote, and we pay remote within a few percent of onsite — no steep location discount. Comp is competitive." },
    { from: "candidate", body: "Good to hear. I'd like to move forward with a first conversation." },
    { from: "recruiter", body: "Wonderful — I'll send a calendar link shortly. Thanks for the quick reply!" },
  ],
  [
    { from: "recruiter", body: "Hi — your background is a strong match for an Enterprise AE opening on our team. Would you be open to a chat?" },
    { from: "candidate", body: "Hi, yes. What's the most important thing to know about this role?" },
    { from: "recruiter", body: "It's a consultative, deal-size-driven seat. We optimize for efficient revenue — fewer reps, larger territories, real accountability." },
    { from: "candidate", body: "That suits how I sell. I prefer depth over volume. What are next steps?" },
    { from: "recruiter", body: "Let's start with a 30-minute intro, then a meeting with the hiring manager. I'll get the first one scheduled." },
    { from: "candidate", body: "Sounds good — looking forward to it." },
  ],
];

export type Cycle3SeedArgs = {
  sql: Sql;
  stripeCompanyId: string;
  /** A second company (different from Stripe) — gives the test candidate a 2nd thread. */
  secondCompanyId: string;
  /** The user_id that created the second-company thread (Stripe recruiter is fine — it is just `created_by`). */
  recruiterId: string;
  testCandidateId: string;
  anonCandidateIds: string[];
};

export async function seedCycle3({
  sql,
  stripeCompanyId,
  secondCompanyId,
  recruiterId,
  testCandidateId,
  anonCandidateIds,
}: Cycle3SeedArgs): Promise<{ articles: number; stages: number; conversations: number; messages: number; pipelineCandidates: number; activity: number }> {
  // ----- articles -----
  for (const a of ARTICLES) {
    await sql`
      insert into public.articles (kind, slug, title, dek, hero_image_url, body_md, author_name, read_minutes, tags, published_at)
      values (
        ${a.kind}, ${a.slug}, ${a.title}, ${a.dek},
        ${`https://images.unsplash.com/photo-1551434678-e076c223a692?w=1200&q=80&sig=${a.slug}`},
        ${a.body}, ${a.author}, ${a.readMinutes}, ${a.tags},
        ${new Date(Date.now() - ARTICLES.indexOf(a) * 3 * 86400_000).toISOString()}
      )
      on conflict (slug) do update set
        title = excluded.title, dek = excluded.dek, body_md = excluded.body_md,
        author_name = excluded.author_name, read_minutes = excluded.read_minutes, tags = excluded.tags
    `;
  }

  // ----- pipeline stages for Stripe -----
  const stageIds: string[] = [];
  for (const s of STAGES) {
    const [row] = await sql<{ id: string }[]>`
      insert into public.pipeline_stages (company_id, name, position, color, is_terminal)
      values (${stripeCompanyId}::uuid, ${s.name}, ${s.position}, ${s.color}, ${s.terminal})
      returning id
    `;
    stageIds.push(row!.id);
  }

  // ----- conversations + message threads -----
  // conversations has UNIQUE(candidate_id, company_id) — one thread per AE<->company
  // pair. So the test candidate gets two threads with two DIFFERENT companies.
  //   threads 0..6  -> Stripe   (recruiter1's company — gives the company inbox >=6)
  //     thread 0      -> test candidate
  //     threads 1..6  -> anon candidates 0..5
  //   thread 7       -> test candidate <-> a second company (its 2nd conversation)
  const threadPlan: { candId: string; companyId: string }[] = THREADS.map((_, i) => {
    if (i === 0) return { candId: testCandidateId, companyId: stripeCompanyId };
    if (i === THREADS.length - 1) return { candId: testCandidateId, companyId: secondCompanyId };
    return { candId: anonCandidateIds[i - 1] ?? testCandidateId, companyId: stripeCompanyId };
  });
  const conversationIds: string[] = [];
  let messageCount = 0;
  for (let i = 0; i < THREADS.length; i++) {
    const { candId, companyId } = threadPlan[i]!;
    if (!candId) continue;
    const turns = THREADS[i]!;
    // base timestamp: this conversation started i*2 days ago
    const baseMs = Date.now() - (i * 2 + 1) * 86400_000;
    // conversation row — created_by is the recruiter who initiated
    const [conv] = await sql<{ id: string }[]>`
      insert into public.conversations (candidate_id, company_id, created_by, status, last_message_at, last_message_preview, created_at)
      values (
        ${candId}::uuid, ${companyId}::uuid, ${recruiterId}::uuid, 'active',
        ${new Date(baseMs + turns.length * 3600_000).toISOString()},
        ${turns[turns.length - 1]!.body.slice(0, 140)},
        ${new Date(baseMs).toISOString()}
      )
      on conflict (candidate_id, company_id) do update set
        last_message_at = excluded.last_message_at, last_message_preview = excluded.last_message_preview
      returning id
    `;
    const convId = conv!.id;
    conversationIds.push(convId);
    // messages — each turn one hour after the last
    for (let t = 0; t < turns.length; t++) {
      const turn = turns[t]!;
      const senderId = turn.from === "recruiter" ? recruiterId : candId;
      const createdAt = new Date(baseMs + t * 3600_000).toISOString();
      // recipient-read: all but the final message are marked read
      const readAt = t < turns.length - 1 ? new Date(baseMs + (t + 1) * 3600_000).toISOString() : null;
      await sql`
        insert into public.messages (conversation_id, sender_user_id, body, read_at, created_at)
        values (${convId}::uuid, ${senderId}::uuid, ${turn.body}, ${readAt}, ${createdAt})
      `;
      messageCount++;
    }
  }

  // ----- pipeline candidates distributed across stages -----
  // ~12 candidates: pull from anon candidates, spread across the 6 stages.
  // Several reuse the conversation rows seeded above (conversation_id link).
  const pipelinePool = anonCandidateIds.slice(0, 12);
  let pipelineCount = 0;
  let activityCount = 0;
  const firstStageId = stageIds[0]!;
  for (let i = 0; i < pipelinePool.length; i++) {
    const candId = pipelinePool[i]!;
    // distribute: stage index walks 0..5 and wraps, weighted toward earlier stages
    const stageIdx = i < 6 ? i : i - 6;
    const stageId = stageIds[stageIdx]!;
    // link a conversation if this candidate has one. anon candidate k is the
    // candidate of THREADS[k+1] (threads 1..6) -> conversationIds[k+1].
    const anonIdx = anonCandidateIds.indexOf(candId);
    const hasThread = anonIdx >= 0 && anonIdx <= THREADS.length - 3;
    const convId = hasThread ? conversationIds[anonIdx + 1] ?? null : null;
    const createdMs = Date.now() - (i + 1) * 3 * 86400_000;
    const [pc] = await sql<{ id: string }[]>`
      insert into public.pipeline_candidates (company_id, candidate_id, stage_id, conversation_id, notes, added_by, last_activity_at, created_at)
      values (
        ${stripeCompanyId}::uuid, ${candId}::uuid, ${stageId}::uuid,
        ${convId ? sql`${convId}::uuid` : null},
        ${i % 3 === 0 ? "Strong verified attainment — prioritize for phone screen." : i % 3 === 1 ? "Good segment fit. Confirm comp expectations." : null},
        ${recruiterId}::uuid,
        ${new Date(Date.now() - i * 86400_000).toISOString()},
        ${new Date(createdMs).toISOString()}
      )
      on conflict (company_id, candidate_id) do update set stage_id = excluded.stage_id
      returning id
    `;
    const pcId = pc!.id;
    pipelineCount++;

    // ----- activity timeline backing this candidate -----
    // every candidate: added_to_pipeline. then progressive stage_changed rows
    // up to their current stage. some get a note_added.
    await sql`
      insert into public.pipeline_activity (pipeline_candidate_id, actor_user_id, kind, payload_json, created_at)
      values (
        ${pcId}::uuid, ${recruiterId}::uuid, 'added_to_pipeline',
        ${JSON.stringify({ stage_id: firstStageId })}::jsonb,
        ${new Date(createdMs).toISOString()}
      )
    `;
    activityCount++;
    // stage_changed rows walking from stage 0 to the candidate's current stage
    for (let s = 1; s <= stageIdx; s++) {
      await sql`
        insert into public.pipeline_activity (pipeline_candidate_id, actor_user_id, kind, payload_json, created_at)
        values (
          ${pcId}::uuid, ${recruiterId}::uuid, 'stage_changed',
          ${JSON.stringify({ from_stage_id: stageIds[s - 1], to_stage_id: stageIds[s] })}::jsonb,
          ${new Date(createdMs + s * 86400_000).toISOString()}
        )
      `;
      activityCount++;
    }
    if (i % 3 === 0) {
      await sql`
        insert into public.pipeline_activity (pipeline_candidate_id, actor_user_id, kind, payload_json, created_at)
        values (
          ${pcId}::uuid, ${recruiterId}::uuid, 'note_added',
          ${JSON.stringify({ note: "Strong verified attainment — prioritize for phone screen." })}::jsonb,
          ${new Date(createdMs + (stageIdx + 1) * 86400_000).toISOString()}
        )
      `;
      activityCount++;
    }
  }

  return {
    articles: ARTICLES.length,
    stages: stageIds.length,
    conversations: conversationIds.length,
    messages: messageCount,
    pipelineCandidates: pipelineCount,
    activity: activityCount,
  };
}
