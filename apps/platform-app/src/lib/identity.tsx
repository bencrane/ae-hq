/**
 * Identity context — the signed-in user's profile, resolved ONCE at app level.
 *
 * Before cycle 4, each portal route group resolved the user's `kind` on its own
 * (`SharedPortalShell` did a per-mount `useMe(true)`), and crossing between the
 * three sibling `<Route element>` groups (candidate / company / shared) forced a
 * layout unmount+remount — the visible navigation flicker.
 *
 * The fix: resolve `/me` exactly once here, app-level, cached for the whole
 * session. `PortalLayout` reads `kind` synchronously from this context, so a
 * single sidebar layout instance wraps every authed route and never remounts on
 * navigation. The query is keyed on the auth user id and never goes stale within
 * a session — identity does not change while signed in.
 */

import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, jsonOf } from "./api";
import { useAuth } from "./auth";
import type { MeResponse } from "./use-me";

type IdentityState = {
  /** The resolved profile + portal context, or null until/unless it loads. */
  identity: MeResponse | null;
  /** True while the first `/me` resolution is in flight (a session exists). */
  loading: boolean;
};

const IdentityContext = createContext<IdentityState>({ identity: null, loading: false });

export function IdentityProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const q = useQuery({
    queryKey: ["identity", userId],
    enabled: Boolean(userId),
    // Identity is immutable within a session — never refetch, never go stale.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    queryFn: () => jsonOf<MeResponse>(api.api.v1.me.$get()),
  });

  return (
    <IdentityContext.Provider
      value={{ identity: q.data ?? null, loading: Boolean(userId) && q.isLoading }}
    >
      {children}
    </IdentityContext.Provider>
  );
}

/** The signed-in user's identity, resolved once at app level. */
export function useIdentity(): IdentityState {
  return useContext(IdentityContext);
}
