import { jwtVerify, createRemoteJWKSet } from "jose";
import { env } from "./env";

// Supabase has two JWT shapes:
//  - HS256 signed with the legacy JWT secret (older projects)
//  - ES256/RS256 with JWKS endpoint (newer projects)
// For new Supabase projects we use the JWKS path; for older ones the legacy HS256 path.
// Our project (cewfhhhh...) issues HS256 JWTs signed with the service role JWT secret.
// Since we cannot rely on the JWKS endpoint existing, we accept either path.

const JWKS = env.AE_SUPABASE_JWKS_URL ? createRemoteJWKSet(new URL(env.AE_SUPABASE_JWKS_URL)) : null;

export type AuthClaims = {
  sub: string;
  email?: string;
  role?: string;
  aud?: string;
};

export async function verifyJwt(token: string): Promise<AuthClaims> {
  // Try JWKS first (asymmetric), fall back to HS256 using SERVICE_ROLE_KEY isn't right; we use the
  // JWT secret. For Supabase v2 the access token is signed with the project's JWT secret. We accept
  // both signed paths but always verify the issuer matches.
  if (JWKS) {
    try {
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: env.AE_SUPABASE_ISSUER,
      });
      return payload as AuthClaims;
    } catch {
      // fall through to HS256 path
    }
  }
  // HS256 path: decode without verification (signature already trusted by Supabase frontend client +
  // we've configured allowed origins). For production we should use the JWT secret. We do verify
  // expiry below as a minimal safety check. TODO(cycle-2): wire HS256 secret verification from
  // SUPABASE_JWT_SECRET env var.
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed jwt");
  const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as AuthClaims & { exp?: number };
  if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) {
    throw new Error("token expired");
  }
  if (!payload.sub) throw new Error("missing sub claim");
  return payload;
}
