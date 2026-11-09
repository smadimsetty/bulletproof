// supabase/functions/delete-account/index.ts
//
// Permanently deletes the calling user's account and all data. Requires the
// caller's JWT (verify_jwt stays at its default of true); the user id comes
// from that JWT, never from the request body.
//
// Order: storage objects -> rows in tables whose owner FK has no
// `on delete cascade` (plus tables whose rows must go before custom
// exercises) -> auth.admin.deleteUser, which cascades everything else
// (profiles, follows, user_blocks, hidden_workouts, workout_likes,
// workout_comments, workout_media, notifications, push_tokens,
// content_reports, user_settings).
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { appleConfig, revokeRefreshToken } from "../_shared/apple.ts";

// Delete-order matters. `col` is the owner column.
//  - old-engine tables reference auth.users WITHOUT cascade
//  - workouts / workout_exercises / workout_sets reference auth.users
//    WITHOUT cascade (children go with `workouts` via ON DELETE CASCADE, and
//    take likes / comments / media / hidden rows on those workouts with them)
//  - sprints cascade to days/exercises/feedback/assessments/results
//  - routine_exercises -> routines -> routine_folders must precede custom
//    exercises (routine_exercises.exercise_id has no cascade)
//  - custom exercises (exercises.owner_id) last: workout_exercises,
//    routine_exercises and sprint_day_exercises reference them without cascade
const OWNED_TABLES: Array<{ table: string; col: string }> = [
  { table: "exercise_logs", col: "owner_id" },
  { table: "daily_feedback", col: "owner_id" },
  { table: "sessions", col: "owner_id" },
  { table: "recommendations", col: "owner_id" }, // cascades blocks + block exercises
  { table: "recovery", col: "owner_id" },
  { table: "activity", col: "owner_id" },
  { table: "user_profile", col: "owner_id" },
  { table: "workouts", col: "owner_id" }, // cascades exercises, sets, likes, comments, media
  { table: "sprints", col: "owner_id" }, // cascades days, day exercises, feedback, assessments
  { table: "routine_exercises", col: "owner_id" },
  { table: "routines", col: "owner_id" },
  { table: "routine_folders", col: "owner_id" },
  { table: "exercises", col: "owner_id" }, // custom exercises only (global rows have null owner)
];

const BUCKETS = ["workout-media", "avatars"];

// Storage `list` is one level deep: entries with a null id are folders.
async function collectPaths(
  admin: SupabaseClient,
  bucket: string,
  prefix: string,
  out: string[],
): Promise<void> {
  const pageSize = 100;
  let offset = 0;
  while (true) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
    });
    if (error) throw new Error(`storage list ${bucket}/${prefix}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const entry of data) {
      const full = `${prefix}/${entry.name}`;
      if (entry.id === null) {
        await collectPaths(admin, bucket, full, out);
      } else {
        out.push(full);
      }
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }
}

async function removeUserObjects(admin: SupabaseClient, bucket: string, uid: string) {
  const paths: string[] = [];
  await collectPaths(admin, bucket, uid, paths);
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
    if (error) throw new Error(`storage remove ${bucket}: ${error.message}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
  const uid = userData.user.id;

  try {
    for (const bucket of BUCKETS) {
      await removeUserObjects(admin, bucket, uid);
    }

    for (const { table, col } of OWNED_TABLES) {
      const { error } = await admin.from(table).delete().eq(col, uid);
      if (error) throw new Error(`delete from ${table}: ${error.message}`);
    }

    // App Store 5.1.1(v): revoke the user's Sign in with Apple tokens. Best
    // effort -- an Apple outage must not block deleting the account.
    const config = appleConfig();
    if (config) {
      const { data: tok } = await admin.from("apple_tokens").select("refresh_token").eq("user_id", uid).maybeSingle();
      if (tok?.refresh_token) {
        await revokeRefreshToken(config, tok.refresh_token).catch((e) =>
          console.warn("Apple token revoke failed:", e instanceof Error ? e.message : e)
        );
      }
    }

    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) throw new Error(`deleteUser: ${delErr.message}`);

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
