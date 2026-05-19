import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { TopNav } from "./components/TopNav";
import { useAuth } from "./lib/auth";

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

function Shell() {
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

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Home />} />
        <Route path="/jobs/:id" element={<JobDetail />} />
        <Route path="/companies/:slug" element={<CompanyPublic />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/404" element={<NotFound />} />
        <Route element={<Protected />}>
          <Route path="/me" element={<Me />} />
          <Route path="/me/profile" element={<MeProfile />} />
          <Route path="/me/intent" element={<MeIntent />} />
          <Route path="/me/credentials" element={<MeCredentials />} />
          <Route path="/me/approvals" element={<MeApprovals />} />
          <Route path="/co" element={<Co />} />
          <Route path="/co/candidates" element={<CoCandidates />} />
          <Route path="/co/candidates/:id" element={<CoCandidateDetail />} />
          <Route path="/co/company" element={<CoCompany />} />
          <Route path="/co/ats" element={<CoAts />} />
          <Route path="/co/billing" element={<CoBilling />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
