import { z } from "zod";

const envSchema = z.object({
  AE_SUPABASE_URL: z.string().url(),
  AE_SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  AE_SUPABASE_JWKS_URL: z.string().url().optional(),
  AE_SUPABASE_ISSUER: z.string().optional(),
  AE_DB_DIRECT_URL: z.string().min(1).optional(),
  ALLOWED_ORIGINS: z.string().default("http://localhost:5173"),
  PORT: z.coerce.number().default(8080),
  APP_ENV: z.enum(["dev", "stg", "prd"]).default("dev"),
});

type Env = z.infer<typeof envSchema>;

// Resolve aliases (AE_SUPABASE_URL falls back to NEXT_PUBLIC_SUPABASE_URL etc.)
function resolveSupabaseUrl(): string | undefined {
  return process.env.AE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
}
function resolveJwksUrl(): string | undefined {
  if (process.env.AE_SUPABASE_JWKS_URL) return process.env.AE_SUPABASE_JWKS_URL;
  const base = resolveSupabaseUrl();
  return base ? `${base.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json` : undefined;
}
function resolveIssuer(): string | undefined {
  if (process.env.AE_SUPABASE_ISSUER) return process.env.AE_SUPABASE_ISSUER;
  const base = resolveSupabaseUrl();
  return base ? `${base.replace(/\/$/, "")}/auth/v1` : undefined;
}

function buildEnv(): Env {
  return envSchema.parse({
    ...process.env,
    AE_SUPABASE_URL: resolveSupabaseUrl(),
    AE_SUPABASE_JWKS_URL: resolveJwksUrl(),
    AE_SUPABASE_ISSUER: resolveIssuer(),
  });
}

// Lazy proxy — env values are validated on first access, NOT at import time. This lets
// `bun test` and `bun build` succeed even when AE_SUPABASE_* aren't in scope.
let cached: Env | null = null;
function getEnv(): Env {
  if (!cached) cached = buildEnv();
  return cached;
}

export const env = new Proxy({} as Env, {
  get(_t, prop: string) {
    // Test mode: when running under bun:test, provide stubs so imports don't blow up.
    const isTestMode = process.env.BUN_TEST === "1" || process.env.NODE_ENV === "test";
    if (isTestMode) {
      const stub: Record<string, string | number> = {
        AE_SUPABASE_URL: "https://stub.supabase.co",
        AE_SUPABASE_SERVICE_ROLE_KEY: "stub",
        AE_SUPABASE_JWKS_URL: "https://stub.supabase.co/auth/v1/.well-known/jwks.json",
        AE_SUPABASE_ISSUER: "https://stub.supabase.co/auth/v1",
        ALLOWED_ORIGINS: "http://localhost:5173",
        PORT: 8080,
        APP_ENV: "dev",
      };
      return stub[prop];
    }
    const env = getEnv() as unknown as Record<string, unknown>;
    return env[prop];
  },
}) as Env;
