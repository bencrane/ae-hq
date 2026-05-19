import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  uploadSignRequestSchema,
  uploadParseRequestSchema,
  plaidExchangeRequestSchema,
} from "@ae-hq/shared";
import { supabaseAdmin } from "../db";
import type { Variables } from "../middleware";

export const credentialsRoutes = new Hono<{ Variables: Variables }>()
  // GET /api/v1/credentials  (candidate's own)
  .get("/", async (c) => {
    const userId = c.get("userId");
    const { data, error } = await supabaseAdmin
      .from("verified_credentials")
      .select("*")
      .eq("candidate_id", userId)
      .order("captured_at", { ascending: false });
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    return c.json({ credentials: data ?? [] });
  })
  // POST /api/v1/credentials/uploads/sign  (MOCKED — return signed URL pointing at /api/v1/credentials/uploads/:id)
  .post("/uploads/sign", zValidator("json", uploadSignRequestSchema), async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");
    const { data, error } = await supabaseAdmin
      .from("credential_uploads")
      .insert({
        candidate_id: userId,
        filename: body.filename,
        content_type: body.content_type,
        byte_size: body.byte_size,
        storage_path: `mock://${userId}/${crypto.randomUUID()}.csv`,
      })
      .select("*")
      .single();
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    return c.json({
      upload_id: data.id,
      // TODO(cycle-2): actual signed Supabase Storage URL
      upload_url: `mock-upload://${data.id}`,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
  })
  // POST /api/v1/credentials/uploads/:id/parse
  .post(
    "/uploads/:id/parse",
    zValidator("json", uploadParseRequestSchema),
    async (c) => {
      const userId = c.get("userId");
      const id = c.req.param("id");
      const body = c.req.valid("json");
      // Verify the upload belongs to the user (defense-in-depth)
      const { data: upload } = await supabaseAdmin
        .from("credential_uploads")
        .select("*")
        .eq("id", id)
        .eq("candidate_id", userId)
        .maybeSingle();
      if (!upload) return c.json({ error: { code: "not_found", message: "upload not found" } }, 404);
      // TODO(cycle-2): real CSV parsing
      const mockValue =
        body.kind === "quota_attainment"
          ? { percent: 112, quota_usd: 1_200_000, attained_usd: 1_344_000 }
          : { rows_parsed: 12 };
      const { data: cred, error } = await supabaseAdmin
        .from("verified_credentials")
        .insert({
          candidate_id: userId,
          kind: body.kind,
          period_start: "2024-01-01",
          period_end: "2024-12-31",
          value_json: mockValue,
          source: `csv:${upload.filename}`,
          verification_tier: "csv_upload",
        })
        .select("*")
        .single();
      if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
      await supabaseAdmin.from("credential_uploads").update({ parsed_at: new Date().toISOString() }).eq("id", id);
      return c.json({ credential_id: cred.id, preview: mockValue });
    },
  )
  // POST /api/v1/credentials/plaid/link-token  (MOCKED)
  .post("/plaid/link-token", async (c) => {
    return c.json({
      // TODO(cycle-2): real Plaid /link/token/create
      link_token: `mock-plaid-link-${crypto.randomUUID()}`,
      expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });
  })
  // POST /api/v1/credentials/plaid/exchange  (MOCKED)
  .post(
    "/plaid/exchange",
    zValidator("json", plaidExchangeRequestSchema),
    async (c) => {
      const userId = c.get("userId");
      // TODO(cycle-2): real Plaid /item/public_token/exchange + payroll fetch
      const { error } = await supabaseAdmin
        .from("verified_credentials")
        .insert({
          candidate_id: userId,
          kind: "income_w2",
          period_start: "2024-01-01",
          period_end: "2024-12-31",
          value_json: { gross_income_usd: 287_500, employer: "Stripe", source: "plaid_payroll_mock" },
          source: "plaid:mock",
          verification_tier: "plaid_payroll",
        });
      if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
      return c.json({ credentials_imported: 1 });
    },
  );
