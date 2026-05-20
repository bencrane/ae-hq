import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { TopNav } from "./components/TopNav";
import { CandidateLayout } from "./components/CandidateLayout";
import { CompanyLayout } from "./components/CompanyLayout";
import { useAuth } from "./lib/auth";
import { useMe } from "./lib/use-me";

const Home = lazy(() => import("./routes/Home").then((m) => ({ default: m.Home })));
const JobDetail = lazy(() => import("./routes/JobDetail").then((m) => ({ default: m.JobDetail })));
const CompanyPublic = lazy(() => import("./routes/CompanyPublic").then((m) => ({ default: m.CompanyPublic })));
const SignIn = lazy(() => import("./routes/SignIn").then((m) => ({ default: m.SignIn })));
const SignUp = lazy(() => import("./routes/SignUp").then((m) => ({ default: m.SignUp })));
const NotFound = lazy(() => import("./routes/NotFound").then((m) => ({ default: m.NotFound })));
const Me = lazy(() => import("./routes/Me").then((m) => ({ default: m.Me })));
const MeProfile = lazy(() => import("./routes/MeProfile").then((m) => ({ default: m.MeProfile })));
const MeIntent = lazy(() => import("./routes/MeIntent").then((m) => ({ default: m.MeIntent })));
const MeCredentials = lazy(() => import("./routes/MeCredentials").then((m) => ({ default: m.MeCredentials })));
const MeApprovals = lazy(() => import("./routes/MeApprovals").then((m) => ({ default: m.MeApprovals })));
const Co = lazy(() => import("./routes/Co").then((m) => ({ default: m.Co })));
const CoCandidates = lazy(() => import("./routes/CoCandidates").then((m) => ({ default: m.CoCandidates })));
const CoCandidateDetail = lazy(() => import("./routes/CoCandidateDetail").then((m) => ({ default: m.CoCandidateDetail })));
const CoCompany = lazy(() => import("./routes/CoCompany").then((m) => ({ default: m.CoCompany })));
const CoAts = lazy(() => import("./routes/CoAts").then((m) => ({ default: m.CoAts })));
const CoBilling = lazy(() => import("./routes/CoBilling").then((m) => ({ default: m.CoBilling })));
const CoPipeline = lazy(() => import("./routes/CoPipeline").then((m) => ({ default: m.CoPipeline })));
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

function CandidateShell() {
  return <CandidateLayout />;
}

function CompanyShell() {
  return <CompanyLayout />;
}

/**
 * Shell for routes shared by both portals (/inbox, /insights). It renders the
 * sidebar layout that matches the signed-in user's kind — CandidateLayout for
 * candidates, CompanyLayout for company members — so a shared route still gets
 * the right chrome for whoever is viewing it.
 */
function SharedPortalShell() {
  const me = useMe(true);
  if (!me) return <PageFallback />;
  return me.profile.kind === "company_member" ? <CompanyLayout /> : <CandidateLayout />;
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

      {/* Authed portals — left sidebar */}
      <Route element={<Protected />}>
        {/* Candidate portal */}
        <Route element={<CandidateShell />}>
          <Route path="/me" element={<Me />} />
          <Route path="/me/profile" element={<MeProfile />} />
          <Route path="/me/intent" element={<MeIntent />} />
          <Route path="/me/credentials" element={<MeCredentials />} />
          <Route path="/me/approvals" element={<MeApprovals />} />
        </Route>

        {/* Company portal */}
        <Route element={<CompanyShell />}>
          <Route path="/co" element={<Co />} />
          <Route path="/co/candidates" element={<CoCandidates />} />
          <Route path="/co/candidates/:id" element={<CoCandidateDetail />} />
          <Route path="/co/company" element={<CoCompany />} />
          <Route path="/co/ats" element={<CoAts />} />
          <Route path="/co/billing" element={<CoBilling />} />
          <Route path="/co/pipeline" element={<CoPipeline />} />
        </Route>

        {/* Shared portal routes — shell picks the layout by user kind */}
        <Route element={<SharedPortalShell />}>
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/inbox/:conversationId" element={<Inbox />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/insights/:slug" element={<ArticleDetail />} />
        </Route>
      </Route>
    </Routes>
  );
}
