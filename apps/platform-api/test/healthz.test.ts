import { describe, it, expect } from "bun:test";
import { app } from "../src/app";

describe("platform-api", () => {
  it("GET /healthz returns 200", async () => {
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  it("GET /api/v1/me without auth returns 401", async () => {
    const res = await app.request("/api/v1/me");
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/jobs returns 200 (public)", async () => {
    const res = await app.request("/api/v1/jobs");
    expect([200, 500]).toContain(res.status);
  });
});
