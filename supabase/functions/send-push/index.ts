// supabase/functions/send-push/index.ts
//
// Called by the notifications_send_push() Postgres trigger (pg_net) for each
// new inbox row. Authenticated by the x-push-secret header (verify_jwt is
// disabled for this function in supabase/config.toml), not a user JWT.
//
// Required function secret: PUSH_WEBHOOK_SECRET (same value as the Vault
// secret `push_webhook_secret`). SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// are provided by the platform.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// notification kind -> user_settings toggle column
const SETTING_FOR_KIND: Record<string, string> = {
  like: "notify_likes",
  comment: "notify_comments",
  follow_request: "notify_follows",
  follow_accepted: "notify_follows",
  new_follower: "notify_follows",
  report: "notify_reports",
};

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expected = Deno.env.get("PUSH_WEBHOOK_SECRET");
  const provided = req.headers.get("x-push-secret") ?? "";
  if (!expected || !safeEqual(provided, expected)) return json({ error: "Unauthorized" }, 401);

  let notificationId: unknown;
  try {
    ({ notification_id: notificationId } = await req.json());
  } catch {
    return json({ error: "Request body must be JSON" }, 400);
  }
  if (typeof notificationId !== "string") return json({ error: "notification_id required" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: n, error: nErr } = await admin
    .from("notifications")
    .select("id, recipient_id, actor_id, kind, workout_id, comment_id, report_id")
    .eq("id", notificationId)
    .maybeSingle();
  if (nErr) return json({ error: nErr.message }, 500);
  if (!n) return json({ ok: true, skipped: "notification not found" });

  // Respect the recipient's per-kind toggle (no settings row = defaults on).
  const settingCol = SETTING_FOR_KIND[n.kind];
  const { data: settings } = await admin
    .from("user_settings")
    .select(settingCol)
    .eq("owner_id", n.recipient_id)
    .maybeSingle();
  if (settings && (settings as Record<string, unknown>)[settingCol] === false) {
    return json({ ok: true, skipped: "disabled by recipient" });
  }

  // Blocks created after the row was written still suppress the push.
  if (n.actor_id) {
    const { data: blocked } = await admin.rpc("is_blocked_between", {
      a: n.recipient_id,
      b: n.actor_id,
    });
    if (blocked) return json({ ok: true, skipped: "blocked" });
  }

  const { data: tokens, error: tErr } = await admin
    .from("push_tokens")
    .select("token")
    .eq("user_id", n.recipient_id);
  if (tErr) return json({ error: tErr.message }, 500);
  if (!tokens || tokens.length === 0) return json({ ok: true, skipped: "no tokens" });

  let handle = "someone";
  if (n.actor_id) {
    const { data: actor } = await admin
      .from("profiles")
      .select("handle")
      .eq("id", n.actor_id)
      .maybeSingle();
    if (actor?.handle) handle = actor.handle;
  }

  let body: string;
  let url: string;
  switch (n.kind) {
    case "like":
      body = `@${handle} liked your workout`;
      url = `/workout-summary/${n.workout_id}`;
      break;
    case "comment": {
      let text = "";
      if (n.comment_id) {
        const { data: c } = await admin
          .from("workout_comments")
          .select("body")
          .eq("id", n.comment_id)
          .maybeSingle();
        text = (c?.body ?? "").slice(0, 80);
      }
      body = `@${handle} commented: "${text}"`;
      url = `/workout-summary/${n.workout_id}`;
      break;
    }
    case "follow_request":
      body = `@${handle} wants to follow you`;
      url = "/inbox";
      break;
    case "follow_accepted":
      body = `@${handle} accepted your follow request`;
      url = `/profile/${n.actor_id}`;
      break;
    case "new_follower":
      body = `@${handle} followed you`;
      url = `/profile/${n.actor_id}`;
      break;
    case "report": {
      let targetType = "content";
      if (n.report_id) {
        const { data: r } = await admin
          .from("content_reports")
          .select("target_type")
          .eq("id", n.report_id)
          .maybeSingle();
        if (r?.target_type) targetType = r.target_type;
      }
      body = `New report: ${targetType}`;
      url = "/inbox";
      break;
    }
    default:
      return json({ ok: true, skipped: "unknown kind" });
  }

  const messages = tokens.map((t: { token: string }) => ({
    to: t.token,
    body,
    sound: "default",
    data: { url },
  }));

  const expoRes = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(messages),
  });
  if (!expoRes.ok) {
    return json({ error: `Expo push failed (${expoRes.status}): ${await expoRes.text()}` }, 502);
  }

  // Tickets come back in the same order as the messages; prune dead tokens.
  const result = await expoRes.json();
  const tickets: Array<{ status: string; details?: { error?: string } }> = result?.data ?? [];
  const dead: string[] = [];
  tickets.forEach((ticket, i) => {
    if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
      dead.push(tokens[i].token);
    }
  });
  if (dead.length > 0) {
    await admin.from("push_tokens").delete().eq("user_id", n.recipient_id).in("token", dead);
  }

  return json({ ok: true, sent: messages.length, pruned: dead.length });
});
