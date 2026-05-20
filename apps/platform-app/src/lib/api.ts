import { hc } from "hono/client";
import { env } from "../env";
import { supabase } from "./supabase";
// Import the type-only AppType from the BFF source — bundler is configured to alias this path
// to apps/platform-api/src/app.ts. Only types cross the boundary; no runtime code is shipped.
import type { AppType } from "@ae-hq/api";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Typed Hono RPC client — single source of truth for every BFF call (path + method types).
export const api = hc<AppType>(env.API_URL, {
  headers: authHeaders,
});

export type Api = typeof api;

// Hono RPC retains route-path types but degrades payload types to `never` for handlers that
// compose responses by spreading Supabase rows. Until cycle-2 (when we tighten handler returns
// to shared zod schemas), we cast Response.json() outputs to JSON-shaped records on the consumer
// side. The shapes are still validated at runtime by the BFF and at egress by `@ae-hq/shared`
// schemas where used.
export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
export type JsonRecord = Record<string, JsonValue>;

export async function jsonOf<T = JsonRecord>(p: Promise<Response>): Promise<T> {
  const res = await p;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
  return (await res.json()) as T;
}
