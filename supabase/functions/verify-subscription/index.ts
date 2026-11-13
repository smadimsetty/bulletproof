// supabase/functions/verify-subscription/index.ts
//
// The app sends the StoreKit 2 signed transactions it holds (after a purchase, a restore,
// or on launch to pick up renewals). POST { transactions: string[] } with the caller's JWT.
// Each one is checked against Apple's signing chain (_shared/appleJws.ts) and our rules
// (_shared/subscriptionRules.ts), then stored in `subscriptions` with the service role.
// A subscription already bound to another MoveMaxx account is refused, so one Apple ID
// can't unlock several accounts. Returns the caller's premium status afterwards.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { verifyAppleJws } from "../_shared/appleJws.ts";
import { subscriptionFromTransaction } from "../_shared/subscriptionRules.ts";

const MAX_TRANSACTIONS = 20;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization) return json({ error: "Unauthorized" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await admin.auth.getUser(authorization.replace(/^Bearer\s+/i, ""));
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
  const userId = userData.user.id;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  const list: unknown[] = Array.isArray(body?.transactions) ? body.transactions.slice(0, MAX_TRANSACTIONS) : [];
  if (list.some((t) => typeof t !== "string")) return json({ error: "Bad request" }, 400);

  const results: Array<{ ok: boolean; reason?: string }> = [];
  for (const jws of list as string[]) {
    try {
      const payload = await verifyAppleJws(jws);
      const mapped = subscriptionFromTransaction(payload, userId);
      if (!mapped.ok) {
        results.push({ ok: false, reason: mapped.reason });
        continue;
      }
      const { data: existing, error: readErr } = await admin
        .from("subscriptions")
        .select("owner_id")
        .eq("original_transaction_id", mapped.row.original_transaction_id)
        .maybeSingle();
      if (readErr) throw new Error(readErr.message);
      if (existing && existing.owner_id !== userId) {
        results.push({ ok: false, reason: "This purchase belongs to another MoveMaxx account" });
        continue;
      }
      const { error: writeErr } = await admin
        .from("subscriptions")
        .upsert({ ...mapped.row, updated_at: new Date().toISOString() }, { onConflict: "original_transaction_id" });
      if (writeErr) throw new Error(writeErr.message);
      results.push({ ok: true });
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      console.warn(`verify-subscription: ${reason}`);
      results.push({ ok: false, reason });
    }
  }

  const { data: status, error: statusErr } = await admin.rpc("premium_status", { p_user: userId });
  if (statusErr) return json({ error: statusErr.message }, 500);
  return json({ status, results });
});
