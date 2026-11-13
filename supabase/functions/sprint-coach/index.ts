// supabase/functions/sprint-coach/index.ts
//
// The only place MoveMaxx calls Claude (spec 2026-11-12 §5.4). Premium users only, at most
// 4 Claude calls per user per rolling 24 hours (_shared/coachLimits.ts). POST
// { trigger: 'start' | 'pain' | 'retest', sprintId } with the caller's JWT.
// Every read and write goes through a client carrying the caller's
// Authorization header, so RLS scopes it to their own sprint. Claude's JSON is
// validated (validate.ts) before anything is written; on any failure nothing
// is written except the engine_calls log row, and the rules apply on their own.
import Anthropic from "npm:@anthropic-ai/sdk@1.2.0";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { OUTPUT_SCHEMAS, painPointBlock, systemPrompt, userBlock } from "./prompt.ts";
import { validatePain, validateRetest, validateStart, type CoachContext } from "./validate.ts";
import { coachBlockReason } from "../_shared/coachLimits.ts";

type Trigger = "start" | "pain" | "retest";
const TRIGGERS: Trigger[] = ["start", "pain", "retest"];

interface Loaded {
  painPointBlockInput: unknown;
  userInput: unknown;
  ctx: CoachContext;
  currentLevelBySlot: Record<string, number>;
}

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

const resultValues = (rows: any[]) =>
  Object.fromEntries(
    rows.map((r) => [r.test_key, { left: r.value_left, right: r.value_right, single: r.value_single }]),
  );

async function load(db: SupabaseClient, trigger: Trigger, sprintId: string): Promise<Loaded> {
  const sprint = must<any>(
    await db.from("sprints").select("id, pain_point_id, cycle_number, status").eq("id", sprintId).single(),
    "sprint",
  );
  const pp = sprint.pain_point_id as string;

  const [painPoints, tests, slots, links, ladder, states, assessments] = await Promise.all([
    db.from("pain_points").select("id, display_name"),
    db.from("assessment_definitions")
      .select("test_key, name, unit, better_direction, raw_direction, target_value, noise_threshold, is_bilateral")
      .eq("pain_point_id", pp),
    db.from("sprint_slots").select("slot_key, area, is_stretch").eq("pain_point_id", pp),
    db.from("assessment_slot_links").select("test_key, slot_key, weight").eq("pain_point_id", pp),
    db.from("slot_ladder")
      .select("slot_key, level, exercise_id, step, sets, reps_or_duration, exercises!slot_ladder_exercise_id_fkey ( name )")
      .eq("pain_point_id", pp),
    db.from("sprint_slot_state").select("slot_key, level, step").eq("sprint_id", sprintId),
    db.from("sprint_assessments")
      .select("phase, sprint_assessment_results ( test_key, value_left, value_right, value_single )")
      .eq("sprint_id", sprintId),
  ]);
  const ppRows = must<any[]>(painPoints, "pain_points");
  const testRows = must<any[]>(tests, "tests");
  const slotRows = must<any[]>(slots, "slots");
  const linkRows = must<any[]>(links, "links");
  const ladderRows = must<any[]>(ladder, "ladder");
  const stateRows = must<any[]>(states, "state");
  const assessRows = must<any[]>(assessments, "assessments");

  const slotKeys = [...new Set(ladderRows.map((r) => r.slot_key as string))].sort();
  const allowed: Record<string, string[]> = {};
  const maxLevel: Record<string, number> = {};
  for (const r of ladderRows) {
    const list = allowed[r.slot_key] ?? (allowed[r.slot_key] = []);
    if (!list.includes(r.exercise_id)) list.push(r.exercise_id);
    maxLevel[r.slot_key] = Math.max(maxLevel[r.slot_key] ?? 1, r.level);
  }
  const current: Record<string, number> = {};
  for (const k of slotKeys) current[k] = 1;
  for (const s of stateRows) current[s.slot_key] = s.level;

  // Stable per pain point: tests with targets, slots, and one row per (slot, level, exercise).
  const ladderByExercise = new Map<string, any>();
  for (const r of ladderRows) {
    const key = `${r.slot_key}|${r.level}|${r.exercise_id}`;
    const prev = ladderByExercise.get(key);
    if (!prev || r.step > prev.top_step) {
      ladderByExercise.set(key, {
        slot_key: r.slot_key, level: r.level, exercise_id: r.exercise_id,
        name: r.exercises?.name ?? "", top_step: r.step, top_dose: `${r.sets} x ${r.reps_or_duration}`,
      });
    }
  }
  const painPointBlockInput = {
    pain_point: { id: pp, name: ppRows.find((p) => p.id === pp)?.display_name ?? pp },
    tests: [...testRows].sort((a, b) => (a.test_key < b.test_key ? -1 : 1)),
    slots: [...slotRows].sort((a, b) => (a.slot_key < b.slot_key ? -1 : 1)),
    links: [...linkRows].sort((a, b) => `${a.slot_key}|${a.test_key}` < `${b.slot_key}|${b.test_key}` ? -1 : 1),
    ladder: [...ladderByExercise.values()].sort((a, b) =>
      `${a.slot_key}|${String(a.level).padStart(2, "0")}|${a.exercise_id}` <
          `${b.slot_key}|${String(b.level).padStart(2, "0")}|${b.exercise_id}`
        ? -1
        : 1
    ),
  };

  const baseline = assessRows.find((a) => a.phase === "baseline")?.sprint_assessment_results ?? [];
  const retest = assessRows.find((a) => a.phase === "reassessment")?.sprint_assessment_results ?? [];
  let userInput: unknown;

  if (trigger === "start") {
    userInput = { cycle: sprint.cycle_number, baseline: resultValues(baseline), current_levels: current };
  } else if (trigger === "pain") {
    // The latest day with feedback, and the slots trained that day.
    const days = must<any[]>(
      await db.from("sprint_days")
        .select("id, date, sprint_day_feedback ( effort, pain, pain_area, note ), sprint_day_exercises ( slot_key, exercise_id )")
        .eq("sprint_id", sprintId)
        .order("date", { ascending: false }),
      "days",
    );
    // sprint_day_feedback is one-to-one (unique sprint_day_id), so it embeds as an object or null.
    const feedbackOf = (d: any) => (Array.isArray(d?.sprint_day_feedback) ? d.sprint_day_feedback[0] : d?.sprint_day_feedback) ?? null;
    const day = days.find((d) => feedbackOf(d) != null);
    const fb = feedbackOf(day);
    userInput = {
      feedback: fb ?? null,
      trained: (day?.sprint_day_exercises ?? []).map((e: any) => ({ slot_key: e.slot_key, exercise_id: e.exercise_id })),
      current_levels: current,
    };
  } else {
    userInput = {
      baseline: resultValues(baseline),
      retest: resultValues(retest),
      other_pain_points: ppRows.filter((p) => p.id !== pp).map((p) => ({ id: p.id, name: p.display_name })),
    };
  }

  return {
    painPointBlockInput,
    userInput,
    currentLevelBySlot: current,
    ctx: {
      trigger,
      slotKeys,
      allowedExerciseIdsBySlot: allowed,
      maxLevelBySlot: maxLevel,
      defaultLevelBySlot: current,
      painPointIds: ppRows.map((p) => p.id as string),
    },
  };
}

async function write(db: SupabaseClient, trigger: Trigger, sprintId: string, out: any): Promise<void> {
  if (trigger === "start") {
    must(await db.from("sprints").update({ ai_summary: out.summary || null }).eq("id", sprintId), "ai_summary");
    const rows = (out.slots as any[]).map((s) => ({
      sprint_id: sprintId, slot_key: s.slot_key, kind: "start", level_override: s.start_level,
      prefer_exercise_ids: s.prefer, avoid_exercise_ids: s.avoid, priority_delta: s.priority_delta,
    }));
    if (rows.length) must(await db.from("sprint_ai_adjustments").insert(rows), "adjustments");
  } else if (trigger === "pain") {
    const rows = (out.slots as any[]).map((s) => ({
      sprint_id: sprintId, slot_key: s.slot_key, kind: "pain", level_override: s.level,
      prefer_exercise_ids: s.prefer, avoid_exercise_ids: s.avoid, note: s.note || null,
    }));
    if (rows.length) must(await db.from("sprint_ai_adjustments").insert(rows), "adjustments");
  } else {
    must(
      await db.from("sprints").update({ retest_recommendation: { ...out, source: "ai" } }).eq("id", sprintId),
      "retest_recommendation",
    );
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization) return json({ error: "Unauthorized" }, 401);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await db.auth.getUser(authorization.replace(/^Bearer\s+/i, ""));
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  const trigger = body?.trigger as Trigger;
  const sprintId = body?.sprintId as string;
  if (!TRIGGERS.includes(trigger) || typeof sprintId !== "string") return json({ error: "Bad request" }, 400);

  const model = Deno.env.get("SPRINT_ENGINE_MODEL") ?? "claude-haiku-5-5";
  let outcome: "ok" | "fallback" | "error" = "fallback";
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let detail = "";

  try {
    const loaded = await load(db, trigger, sprintId);
    // Premium + the per-user daily cap, checked before any paid call. RLS scopes
    // engine_calls to the caller; only rows with token counts reached Claude.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [statusRes, callsRes] = await Promise.all([
      db.rpc("my_premium_status"),
      db.from("engine_calls").select("id", { count: "exact", head: true }).gte("created_at", since).not("input_tokens", "is", null),
    ]);
    const blocked = coachBlockReason({
      aiCallsLast24h: callsRes.count ?? Number.MAX_SAFE_INTEGER, // fail closed if the count can't be read
      premiumStatus: statusRes.error ? null : (statusRes.data as any)?.status ?? null,
    });
    if (blocked) {
      detail = blocked;
    } else if (!Deno.env.get("ANTHROPIC_API_KEY")) {
      detail = "no ANTHROPIC_API_KEY";
    } else {
      const anthropic = new Anthropic();
      // Typed loosely: output_config.format is newer than some SDK type releases.
      const params: any = {
        model,
        max_tokens: 4000,
        system: [
          { type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } },
          { type: "text", text: painPointBlock(loaded.painPointBlockInput), cache_control: { type: "ephemeral" } },
        ],
        // Haiku 5.5 thinks by default and thinking counts toward max_tokens: keep effort low.
        output_config: { effort: "low", format: { type: "json_schema", schema: OUTPUT_SCHEMAS[trigger] } },
        messages: [{ role: "user", content: userBlock(trigger, loaded.userInput) }],
      };
      const msg: any = await anthropic.messages.create(params);
      inputTokens = msg.usage?.input_tokens ?? null;
      outputTokens = msg.usage?.output_tokens ?? null;

      if (msg.stop_reason === "refusal" || msg.stop_reason === "max_tokens") {
        detail = `stop_reason ${msg.stop_reason}`;
      } else {
        const textBlock = (msg.content ?? []).find((b: any) => b.type === "text");
        const raw = textBlock ? JSON.parse(textBlock.text) : null;
        const out = trigger === "start"
          ? validateStart(raw, loaded.ctx)
          : trigger === "pain"
          ? validatePain(raw, loaded.ctx, loaded.currentLevelBySlot)
          : validateRetest(raw, loaded.ctx);
        if (out) {
          await write(db, trigger, sprintId, out);
          outcome = "ok";
        } else {
          detail = "invalid output";
        }
      }
    }
  } catch (e) {
    outcome = "error";
    detail = e instanceof Error ? e.message : String(e);
  }

  if (detail) console.warn(`sprint-coach ${trigger} ${outcome}: ${detail}`);
  const { error: logError } = await db.from("engine_calls").insert({
    sprint_id: sprintId, trigger, model, input_tokens: inputTokens, output_tokens: outputTokens, outcome,
  });
  if (logError) console.warn(`engine_calls insert failed: ${logError.message}`);

  return json({ ok: outcome === "ok", outcome });
});
