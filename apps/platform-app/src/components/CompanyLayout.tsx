import { Suspense } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Building2,
  Briefcase,
  Cable,
  CreditCard,
  MessagesSquare,
  KanbanSquare,
  Newspaper,
  Bell,
  LogOut,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { useNotifications } from "../lib/use-notifications";

// Section divider — ONE treatment, shared by every rule in both portal sidebars.
// 1px, zinc-900, full-bleed (no inset). The `data-divider` tag lets the e2e
// geometry verifier confirm every divider is identical (criterion 8).
const DIVIDER = "border-zinc-900";

function ContentFallback() {
  return (
    <div className="flex items-center justify-center px-6 py-32">
      <span className="data-mono font-mono text-xs uppercase tracking-[0.2em] text-emerald-400">
        Loading...
      </span>
    </div>
  );
}

type NavItem = {
  to: string;
  end?: boolean;
  label: string;
  icon: typeof LayoutDashboard;
};

const NAV: ReadonlyArray<NavItem> = [
  { to: "/co", end: true, label: "Dashboard", icon: LayoutDashboard },
  { to: "/co/jobs", label: "Job postings", icon: Briefcase },
  { to: "/co/candidates", label: "Candidates", icon: Users },
  { to: "/co/pipeline", label: "Pipeline", icon: KanbanSquare },
  { to: "/inbox", label: "Messages", icon: MessagesSquare },
  { to: "/insights", label: "Insights", icon: Newspaper },
  { to: "/co/company", label: "Company page", icon: Building2 },
  { to: "/co/ats", label: "ATS sync", icon: Cable },
  { to: "/co/billing", label: "Billing", icon: CreditCard },
];

export function CompanyLayout() {
  const { session, signOut } = useAuth();
  const { unreadCount } = useNotifications(session?.user?.id);
  const email = session?.user?.email ?? "";
  // Derive a company label from the email's domain — replaced with real data
  // once the company-membership endpoint is wired into the layout.
  const domain = email.split("@")[1] ?? "";
  const companyLabel = domain ? domain.split(".")[0] : "Company";
  const companyDisplay = companyLabel ? companyLabel.charAt(0).toUpperCase() + companyLabel.slice(1) : "Company";
  const initials = companyDisplay.slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      <aside
        data-testid="portal-sidebar"
        className="sticky top-0 flex h-screen w-[260px] shrink-0 flex-col border-r border-zinc-900 bg-zinc-950"
      >
        {/* Wordmark */}
        <Link
          to="/"
          data-divider="wordmark"
          className={`flex items-baseline gap-2 border-b ${DIVIDER} px-6 py-5`}
        >
          <span className="font-display text-base font-semibold tracking-tight">AccountExecutive</span>
          <span className="data-mono font-mono text-[9px] uppercase tracking-[0.2em] text-emerald-400">.com</span>
        </Link>

        {/* Identity — avatar + name only (no numbered eyebrow on chrome) */}
        <div data-divider="identity" className={`border-b ${DIVIDER} px-6 py-4`}>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-none border border-emerald-500/40 bg-emerald-500/10 font-mono text-xs font-semibold text-emerald-300">
              {initials}
            </div>
            <div className="min-w-0">
              <div
                data-testid="sidebar-identity-name"
                className="truncate text-sm font-medium text-zinc-100"
              >
                {companyDisplay}
              </div>
              <div className="truncate font-mono text-[11px] text-emerald-400">Active subscription</div>
            </div>
          </div>
        </div>

        {/* Primary nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="data-mono mb-2 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Workspace
          </div>
          <ul className="space-y-px">
            {NAV.map(({ to, end, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 border-l-2 px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? "border-emerald-500 bg-emerald-500/5 text-zinc-100"
                        : "border-transparent text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900/40 hover:text-zinc-100"
                    }`
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="flex-1">{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Footer */}
        <div data-divider="footer" className={`border-t ${DIVIDER} px-6 py-4`}>
          <div className="mb-3 flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            <span className="data-mono font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-400">
              {">"}_ Terminal operational
            </span>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="data-mono flex w-full items-center justify-center gap-2 rounded-none border border-zinc-800 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-zinc-300 transition-colors hover:border-zinc-700 hover:text-zinc-100"
          >
            <LogOut className="h-3 w-3" aria-hidden /> Sign out
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-20 flex h-12 items-center justify-end gap-3 border-b border-zinc-900 bg-zinc-950/80 px-6 backdrop-blur">
          <Link
            to="/me/approvals"
            aria-label="Notifications"
            className="relative rounded-none border border-zinc-800 p-1.5 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100"
          >
            <Bell className="h-4 w-4" aria-hidden />
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-emerald-500 px-1 font-mono text-[10px] font-semibold text-zinc-950">
                {unreadCount}
              </span>
            ) : null}
          </Link>
        </div>
        <main className="flex-1">
          <Suspense fallback={<ContentFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
