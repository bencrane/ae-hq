import { useEffect, useState } from "react";
import { api, jsonOf } from "./api";

export type MeProfile = {
  user_id: string;
  kind: "candidate" | "company_member" | "admin";
  name: string;
  email: string;
};

export type MeResponse = {
  profile: MeProfile;
  candidate_id: string | null;
  company_id: string | null;
  company_role: "admin" | "recruiter" | "member" | null;
};

export type CompanyContext = {
  company: { id: string; name: string; slug: string; logo_url: string | null };
  subscription: {
    tier: string | null;
    unlocks_per_month: number;
    unlocks_used_current_period: number;
  } | null;
};

export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2) || "AE"
  );
}

export function useCompanyContext(enabled: boolean) {
  const [data, setData] = useState<CompanyContext | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    Promise.all([
      jsonOf<{ company: CompanyContext["company"] }>(api.api.v1.company.me.$get()),
      jsonOf<{ subscription: CompanyContext["subscription"] }>(api.api.v1.company.billing.$get()),
    ])
      .then(([co, bil]) => {
        if (!alive) return;
        setData({ company: co.company, subscription: bil.subscription });
      })
      .catch(() => {
        if (alive) setData(null);
      });
    return () => {
      alive = false;
    };
  }, [enabled]);
  return data;
}

