import { Suspense } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  UserCircle2,
  Compass,
  BadgeCheck,
  Inbox,
  MessagesSquare,
  Newspaper,
  Briefcase,
  Bell,
  LogOut,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { useNotifications } from "../lib/use-notifications";

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
  { to: "/me", end: true, label: "Dashboard", icon: LayoutDashboard },
  { to: "/me/profile", label: "Profile", icon: UserCircle2 },
  { to: "/me/intent", label: "Intent", icon: Compass },
  { to: "/me/credentials", label: "Credentials", icon: BadgeCheck },
  { to: "/me/approvals", label: "Approvals", icon: Inbox },
  { to: "/inbox", label: "Messages", icon: MessagesSquare },
  { to: "/insights", label: "Insights", icon: Newspaper },
];

export function CandidateLayout() {
  const { session, signOut } = useAuth();
  const { unreadCount } = useNotifications(session?.user?.id);
  const displayName = "Account Executive";
  const initials = "AE";

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      <aside className="sticky top-0 flex h-screen w-[260px] shrink-0 flex-col border-r border-zinc-900 bg-zinc-950">
        {/* Wordmark */}
        <Link to="/" className="flex items-baseline gap-2 border-b border-zinc-900 px-6 py-5">
          <span className="font-display text-base font-semibold tracking-tight">AccountExecutive</span>
          <span className="data-mono font-mono text-[9px] uppercase tracking-[0.2em] text-emerald-400">.com</span>
        </Link>

        {/* Identity */}
        <div className="border-b border-zinc-900 px-6 py-4">
          <div className="data-mono mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            01 // Signed in as
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-none border border-emerald-500/40 bg-emerald-500/10 font-mono text-xs font-semibold text-emerald-300">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-zinc-100">{displayName}</div>
            </div>
          </div>
        </div>

        {/* Primary nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="data-mono mb-2 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            02 // Workspace
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
                  {to === "/me/approvals" && unreadCount > 0 ? (
                    <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-emerald-500 px-1 font-mono text-[10px] font-semibold text-zinc-950">
                      {unreadCount}
                    </span>
                  ) : null}
                </NavLink>
              </li>
            ))}
          </ul>

          <div className="data-mono mb-2 mt-6 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            03 // Discover
          </div>
          <ul className="space-y-px">
            <li>
              <NavLink
                to="/"
                className="group flex items-center gap-3 border-l-2 border-transparent px-3 py-2 text-sm text-zinc-400 transition-colors hover:border-zinc-700 hover:bg-zinc-900/40 hover:text-zinc-100"
              >
                <Briefcase className="h-4 w-4 shrink-0" aria-hidden />
                <span>Browse jobs</span>
              </NavLink>
            </li>
          </ul>
        </nav>

        {/* Footer: status pill + sign out */}
        <div className="border-t border-zinc-900 px-6 py-4">
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
        {/* Thin top strip — context + bell only (sidebar owns identity + nav) */}
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
