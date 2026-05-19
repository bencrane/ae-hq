import { Link, NavLink } from "react-router-dom";
import { Bell } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useNotifications } from "../lib/use-notifications";

export function TopNav() {
  const { session, signOut } = useAuth();
  const { unreadCount } = useNotifications(session?.user?.id);

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-baseline gap-2">
            <span className="font-display text-lg font-semibold tracking-tight">AccountExecutive</span>
            <span className="data-mono font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-400">.com</span>
          </Link>
          <nav className="hidden gap-6 text-sm md:flex">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `transition-colors ${isActive ? "text-zinc-100" : "text-zinc-400 hover:text-zinc-100"}`
              }
            >
              Jobs
            </NavLink>
            {session ? (
              <>
                <NavLink
                  to="/me"
                  className={({ isActive }) =>
                    `transition-colors ${isActive ? "text-zinc-100" : "text-zinc-400 hover:text-zinc-100"}`
                  }
                >
                  Candidate
                </NavLink>
                <NavLink
                  to="/co"
                  className={({ isActive }) =>
                    `transition-colors ${isActive ? "text-zinc-100" : "text-zinc-400 hover:text-zinc-100"}`
                  }
                >
                  Company
                </NavLink>
              </>
            ) : null}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {session ? (
            <>
              <Link
                to="/me/approvals"
                aria-label="Notifications"
                className="relative rounded-none border border-zinc-800 p-2 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100"
              >
                <Bell className="h-4 w-4" aria-hidden />
                {unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-emerald-500 px-1 font-mono text-[10px] font-semibold text-zinc-950">
                    {unreadCount}
                  </span>
                ) : null}
              </Link>
              <button
                type="button"
                onClick={() => void signOut()}
                className="data-mono rounded-none border border-zinc-800 px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-zinc-300 hover:border-zinc-700 hover:text-zinc-100"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                to="/signin"
                className="data-mono rounded-none border border-zinc-800 px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-zinc-300 hover:border-zinc-700 hover:text-zinc-100"
              >
                Sign in
              </Link>
              <Link
                to="/signup"
                className="data-mono rounded-none bg-emerald-500 px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-zinc-950 hover:bg-emerald-400"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
