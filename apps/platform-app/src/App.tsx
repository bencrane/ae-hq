import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { TopNav } from "./components/TopNav";
import { CandidateLayout } from "./components/CandidateLayout";
import { CompanyLayout } from "./components/CompanyLayout";
import { useAuth } from "./lib/auth";
import { useIdentity } from "./lib/identity";

const Home = lazy(() => import("./routes/Home").then((m) => ({ default: m.Home })));
const JobDetail = lazy(() => import("./routes/JobDetail").then((m) => ({ default: m.JobDetail })));
const CompanyPublic = lazy(() => import("./routes/CompanyPublic").then((m) => ({ default: m.CompanyPublic })));
const SignIn = lazy(() => import("./routes/SignIn").then((m) => ({ default: m.SignIn })));
const SignUp = lazy(() => import("./routes/SignUp").then((m) => ({ default: m.SignUp })));
const NotFound = lazy(() => import("./routes/NotFound").then((m) => ({ default: m.NotFound })));
const Me = lazy(() => import("./routes/Me").then((m) => ({ default: m.Me })));
const MeJobs = lazy(() => import("./routes/MeJobs").then((m) => ({ default: m.MeJobs })));
const MeProfile = lazy(() => import("./routes/MeProfile").then((m) => ({ default: m.MeProfile })));
const MeIntent = lazy(() => import("./routes/MeIntent").then((m) => ({ default: m.MeIntent })));
const MeCredentials = lazy(() => import("./routes/MeCredentials").then((m) => ({ default: m.MeCredentials })));
const MeApprovals = lazy(() => import("./routes/MeApprovals").then((m) => ({ default: m.MeApprovals })));
const Co = lazy(() => import("./routes/Co").then((m) => ({ default: m.Co })));
const CoCandidates = lazy(() => import("./routes/CoCandidates").then((m) => ({ default: m.CoCandidates })));
const CoCandidateDetail = lazy(() => import("./routes/CoCandidateDetail").then((m) => ({ default: m.CoCandidateDetail })));
const CoDiscover = lazy(() => import("./routes/CoDiscover").then((m) => ({ default: m.CoDiscover })));
const CoMatchCriteria = lazy(() => import("./routes/CoMatchCriteria").then((m) => ({ default: m.CoMatchCriteria })));
const CoCompany = lazy(() => import("./routes/CoCompany").then((m) => ({ default: m.CoCompany })));
const CoAts = lazy(() => import("./routes/CoAts").then((m) => ({ default: m.CoAts })));
const CoBilling = lazy(() => import("./routes/CoBilling").then((m) => ({ default: m.CoBilling })));
const CoPipeline = lazy(() => import("./routes/CoPipeline").then((m) => ({ default: m.CoPipeline })));
const CoJobs = lazy(() => import("./routes/CoJobs").then((m) => ({ default: m.CoJobs })));
const CoJobPipeline = lazy(() => import("./routes/CoJobPipeline").then((m) => ({ default: m.CoJobPipeline })));
const Inbox = lazy(() => import("./routes/Inbox").then((m) => ({ default: m.Inbox })));
const Insights = lazy(() => import("./routes/Insights").then((m) => ({ default: m.Insights })));
const ArticleDetail = lazy(() => import("./routes/ArticleDetail").then((m) => ({ default: m.ArticleDetail })));

function PageFallback() {
  return (
    <div className="mx-auto flex max-w-7xl items-center justify-center px-6 py-32">
      <span className="data-mono font-mono text-xs uppercase tracking-[0.2em] text-emerald-400">
        Loading...
      </span>
    </div>
  );
}

function Protected() {
  const { session, loading } = useAuth();
  if (loading) return <PageFallback />;
  if (!session) return <Navigate to="/signin" replace />;
  return <Outlet />;
}

function PublicShell() {
  return (
    <>
      <TopNav />
      <main className="min-h-[calc(100vh-3.5rem)]">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>
    </>
  );
}

/**
 * The ONE persistent layout for every authed portal route (`/me/*`, `/co/*`,
 * `/inbox`, `/insights`).
 *
 * The signed-in user's `kind` is resolved once, app-level, by `IdentityProvider`
 * — so this component renders a single, stable sidebar layout (CandidateLayout
 * for candidates, CompanyLayout for company members) that mounts once and stays
 * mounted across every in-portal navigation. Because all portal routes are
 * children of ONE `<Route element={<PortalLayout/>}>`, React Router never
 * unmounts the layout when navigation crosses between `/co`, `/inbox`,
 * `/insights`, etc. — only the `<Outlet/>` content swaps. That continuity is the
 * navigation-flicker fix: the sidebar `<aside>` is never replaced.
 *
 * The `<PageFallback/>` here only ever shows on the very first app load, before
 * the identity query resolves — never during navigation (identity is cached for
 * the whole session).
 */
function PortalLayout() {
  const { identity, loading } = useIdentity();
  if (loading) return <PageFallback />;
  return identity?.profile.kind === "company_member" ? <CompanyLayout /> : <CandidateLayout />;
}

export function App() {
  return (
    <Routes>
      {/* Public routes — top nav shell */}
      <Route element={<PublicShell />}>
        <Route index element={<Home />} />
        <Route path="/jobs/:id" element={<JobDetail />} />
        <Route path="/companies/:slug" element={<CompanyPublic />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      {/* Authed portal — ONE persistent sidebar layout wraps every route here,
          so portal navigation never unmounts the sidebar (flicker fix). */}
      <Route element={<Protected />}>
        <Route element={<PortalLayout />}>
          {/* Candidate portal */}
          <Route path="/me" element={<Me />} />
          <Route path="/me/jobs" element={<MeJobs />} />
          <Route path="/me/profile" element={<MeProfile />} />
          <Route path="/me/intent" element={<MeIntent />} />
          <Route path="/me/credentials" element={<MeCredentials />} />
          <Route path="/me/approvals" element={<MeApprovals />} />

          {/* Company portal */}
          <Route path="/co" element={<Co />} />
          <Route path="/co/candidates" element={<CoCandidates />} />
          <Route path="/co/candidates/:id" element={<CoCandidateDetail />} />
          <Route path="/co/discover" element={<CoDiscover />} />
          <Route path="/co/match-criteria" element={<CoMatchCriteria />} />
          <Route path="/co/company" element={<CoCompany />} />
          <Route path="/co/ats" element={<CoAts />} />
          <Route path="/co/billing" element={<CoBilling />} />
          <Route path="/co/pipeline" element={<CoPipeline />} />
          <Route path="/co/jobs" element={<CoJobs />} />
          <Route path="/co/jobs/:id" element={<CoJobPipeline />} />

          {/* Shared portal routes */}
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/inbox/:conversationId" element={<Inbox />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/insights/:slug" element={<ArticleDetail />} />
        </Route>
      </Route>
    </Routes>
  );
}
