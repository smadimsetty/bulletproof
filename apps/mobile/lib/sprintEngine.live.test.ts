// apps/mobile/lib/sprintEngine.live.test.ts
//
// LIVE check of the lazy day build against the linked Supabase project, as a
// throwaway user created and deleted here (never a real account). Skipped
// unless LIVE_ENGINE=1. Run from apps/mobile with the repo-root .env loaded:
//   set -a; . ../../.env; set +a; LIVE_ENGINE=1 npx jest lib/sprintEngine.live
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let mockClient: SupabaseClient;
jest.mock('./supabase', () => ({
  get supabase() {
    return mockClient;
  },
}));

import { ensureDayBuilt } from './sprintEngine';
import {
  activateSprintAfterBaseline, fetchSwapCandidates, fetchTodaySprintDay, stepDownExercise, type Sprint,
} from './sprintLifecycle';
import { localDateString } from './localDate';

const LIVE = process.env.LIVE_ENGINE === '1';
const URL = process.env.SUPABASE_URL ?? '';
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const AN = process.env.SUPABASE_ANON_KEY ?? '';
const PAIN_POINT = 'ankle';

(LIVE ? describe : describe.skip)('live: lazy day build', () => {
  jest.setTimeout(60_000);
  const admin = () => createClient(URL, SR, { auth: { persistSession: false } });
  let userId = '';
  let sprint: Sprint;

  beforeAll(async () => {
    const email = `engine-live-${Date.now()}@example.com`;
    const password = `pw-${Math.random().toString(36).slice(2)}-A1!`;
    const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user!.id;
    mockClient = createClient(URL, AN, { auth: { persistSession: false } });
    const { error: signInError } = await mockClient.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;

    const { data: s, error: sErr } = await mockClient
      .from('sprints')
      .insert({ pain_point_id: PAIN_POINT, cycle_number: 1, started_on: localDateString(new Date()), status: 'pending_baseline' })
      .select('id, pain_point_id, cycle_number, started_on, status')
      .single();
    if (sErr) throw sErr;
    sprint = { id: s.id, painPointId: s.pain_point_id, cycleNumber: 1, startedOn: s.started_on, status: s.status };

    const { data: a, error: aErr } = await mockClient
      .from('sprint_assessments')
      .insert({ sprint_id: sprint.id, phase: 'baseline', completed_at: new Date().toISOString() })
      .select('id')
      .single();
    if (aErr) throw aErr;
    const { data: defs } = await mockClient
      .from('assessment_definitions')
      .select('test_key, is_bilateral')
      .eq('pain_point_id', PAIN_POINT);
    const results = (defs ?? []).map((d: any) =>
      d.is_bilateral
        ? { sprint_assessment_id: a.id, test_key: d.test_key, value_left: 5, value_right: 9 }
        : { sprint_assessment_id: a.id, test_key: d.test_key, value_single: 5 },
    );
    const { error: rErr } = await mockClient.from('sprint_assessment_results').insert(results);
    if (rErr) throw rErr;
  });

  afterAll(async () => {
    if (!userId) return;
    await admin().from('sprints').delete().eq('owner_id', userId);
    await admin().auth.admin.deleteUser(userId);
  });

  const exerciseCount = async (dayIds: string[]) => {
    const { count, error } = await mockClient
      .from('sprint_day_exercises')
      .select('id', { count: 'exact', head: true })
      .in('sprint_day_id', dayIds);
    if (error) throw error;
    return count ?? 0;
  };

  test('activation lays out 14 empty days and slot state', async () => {
    await activateSprintAfterBaseline(sprint);
    const { data: days } = await mockClient.from('sprint_days').select('id, built_at').eq('sprint_id', sprint.id);
    expect(days).toHaveLength(14);
    expect(days!.every((d: any) => d.built_at == null)).toBe(true);
    expect(await exerciseCount(days!.map((d: any) => d.id))).toBe(0);
    const { data: state } = await mockClient.from('sprint_slot_state').select('slot_key').eq('sprint_id', sprint.id);
    expect((state ?? []).length).toBeGreaterThan(0);
  });

  test('fetching today builds it once; a second fetch adds nothing', async () => {
    const first = await fetchTodaySprintDay(sprint.id);
    expect(first!.exercises.length).toBeGreaterThan(0);
    expect(first!.whyToday).toBeTruthy();
    expect(first!.exercises.every((e) => e.level != null && e.step != null)).toBe(true);
    const again = await fetchTodaySprintDay(sprint.id);
    expect(again!.exercises.map((e) => e.id)).toEqual(first!.exercises.map((e) => e.id));
    // eslint-disable-next-line no-console
    console.log(first!.whyToday, first!.exercises.map((e) => `${e.exerciseName} L${e.level}s${e.step} ${e.prescribedSets}x${e.prescribedRepsOrDuration}${e.extraSideSet ? ` +1 ${e.leadSide}` : ''}`));
  });

  test('two concurrent builds of the same day write one set of rows', async () => {
    const { data: day2 } = await mockClient
      .from('sprint_days').select('id, date').eq('sprint_id', sprint.id).eq('day_number', 2).single();
    await Promise.all([ensureDayBuilt(sprint.id, day2!.date), ensureDayBuilt(sprint.id, day2!.date)]);
    const n = await exerciseCount([day2!.id]);
    expect(n).toBeGreaterThan(0);
    const { data: rows } = await mockClient.from('sprint_day_exercises').select('slot_key').eq('sprint_day_id', day2!.id);
    expect(new Set(rows!.map((r: any) => r.slot_key)).size).toBe(rows!.length);
  });
  test('swap candidates stay on the level; easier version steps the slot back', async () => {
    const today = (await fetchTodaySprintDay(sprint.id))!;
    const { data: ladder } = await mockClient.from('slot_ladder').select('slot_key, level').eq('pain_point_id', PAIN_POINT);
    const target = today.exercises.find((e) => (ladder ?? []).some((r: any) => r.slot_key === e.slotKey && r.level === 2))!;
    expect(target).toBeDefined();

    const options = await fetchSwapCandidates(PAIN_POINT, target.slotKey, 1, target.exerciseId, 1);
    expect(options.every((o) => o.level === 1 && o.name !== 'Unknown exercise')).toBe(true);

    // Put the slot at level 2 step 1, then step down: level 1 at its last step.
    await mockClient.from('sprint_slot_state').update({ level: 2, step: 1 }).eq('sprint_id', sprint.id).eq('slot_key', target.slotKey);
    await mockClient.from('sprint_day_exercises').update({ level: 2, step: 1 }).eq('id', target.id);
    await stepDownExercise(target.id, sprint.id, target.slotKey);
    const { data: row } = await mockClient.from('sprint_day_exercises').select('level, step').eq('id', target.id).single();
    const { data: state } = await mockClient
      .from('sprint_slot_state').select('level, step').eq('sprint_id', sprint.id).eq('slot_key', target.slotKey).single();
    expect(row!.level).toBe(1);
    expect(state).toEqual({ level: 1, step: row!.step });
  });
});
