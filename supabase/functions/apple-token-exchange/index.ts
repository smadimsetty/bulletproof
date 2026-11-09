// supabase/functions/apple-token-exchange/index.ts
//
// Called by the app right after a Sign in with Apple. Exchanges the one-time
// authorization code for a refresh token and stores it in apple_tokens
// (service-role-only table), so delete-account can revoke it later as App
// Store guideline 5.1.1(v) requires. Requires the caller's JWT; the user id
// comes from it, never from the body. Not configured -> 200 { skipped }.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { appleConfig, exchangeAuthorizationCode } from "../_shared/apple.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

  const config = appleConfig();
  if (!config) return json({ skipped: "not_configured" });

  const { authorizationCode } = await req.json().catch(() => ({}));
  if (typeof authorizationCode !== "string" || authorizationCode.length === 0) {
    return json({ error: "authorizationCode required" }, 400);
  }

  try {
    const refreshToken = await exchangeAuthorizationCode(config, authorizationCode);
    const { error } = await admin
      .from("apple_tokens")
      .upsert({ user_id: userData.user.id, refresh_token: refreshToken, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
