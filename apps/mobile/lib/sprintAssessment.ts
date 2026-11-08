// Assessment definitions (the per-pain-point test battery), submitting a
// baseline or reassessment, and the pure before/after comparison the
// summary screen renders. See design spec section 2.1/2.2 for the
// assessment_definitions/sprint_assessments/sprint_assessment_results
// schema this implements.
import { supabase } from './supabase';

export type BetterDirection = 'lower' | 'higher' | 'symmetry';

export interface AssessmentDefinition {
  readonly testKey: string;
  readonly name: string;
  readonly instructions: string;
  readonly unit: string;
  readonly targetDescription: string;
  readonly betterDirection: BetterDirection;
  readonly isBilateral: boolean;
  readonly isSynthesized: boolean;
}

export interface AssessmentResultInput {
  readonly testKey: string;
  readonly valueLeft?: number;
  readonly valueRight?: number;
  readonly valueSingle?: number;
  readonly notes?: string;
}

function toAssessmentDefinition(row: any): AssessmentDefinition {
  return {
    testKey: row.test_key,
    name: row.name,
    instructions: row.instructions,
    unit: row.unit,
    targetDescription: row.target_description,
    betterDirection: row.better_direction,
    isBilateral: row.is_bilateral,
    isSynthesized: row.is_synthesized,
  };
}

export async function fetchAssessmentDefinitions(painPointId: string): Promise<AssessmentDefinition[]> {
  const { data, error } = await supabase
    .from('assessment_definitions')
    .select('test_key, name, instructions, unit, target_description, better_direction, is_bilateral, is_synthesized')
    .eq('pain_point_id', painPointId)
    .order('sort_order');

  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as any[]).map(toAssessmentDefinition);
}

/**
 * A result is complete once every bilateral definition has both left and
 * right values, and every non-bilateral definition has a single value --
 * used to gate the assessment form's submit button.
 */
export function isAssessmentComplete(
  definitions: readonly AssessmentDefinition[],
  draft: ReadonlyMap<string, AssessmentResultInput>
): boolean {
  return definitions.every((def) => {
    const entry = draft.get(def.testKey);
    if (!entry) return false;
    return def.isBilateral
      ? entry.valueLeft !== undefined && entry.valueRight !== undefined
      : entry.valueSingle !== undefined;
  });
}

export async function submitAssessment(
  sprintId: string,
  phase: 'baseline' | 'reassessment',
  results: readonly AssessmentResultInput[]
): Promise<void> {
  const { data: assessment, error: assessmentError } = await supabase
    .from('sprint_assessments')
    .upsert({ sprint_id: sprintId, phase, completed_at: new Date().toISOString() }, { onConflict: 'sprint_id,phase' })
    .select('id')
    .single();
  if (assessmentError) throw new Error(assessmentError.message);

  const resultRows = results.map((r) => ({
    sprint_assessment_id: (assessment as any).id,
    test_key: r.testKey,
    value_left: r.valueLeft ?? null,
    value_right: r.valueRight ?? null,
    value_single: r.valueSingle ?? null,
    notes: r.notes ?? null,
  }));

  const { error: resultsError } = await supabase
    .from('sprint_assessment_results')
    .upsert(resultRows, { onConflict: 'sprint_assessment_id,test_key' });
  if (resultsError) throw new Error(resultsError.message);

  // Note the asymmetry: the baseline phase deliberately does NOT flip the
  // sprint to 'active' here. activateSprintAfterBaseline owns that, after
  // its 14-day generation loop succeeds -- flipping it first left a failed
  // generation as an 'active' sprint with missing days, which the Home
  // screen has no way out of. The reassessment phase has no analogous
  // follow-up step, so completing here is correct.
  if (phase === 'reassessment') {
    const { error: completeError } = await supabase.from('sprints').update({ status: 'completed' }).eq('id', sprintId);
    if (completeError) throw new Error(completeError.message);
  }
}

export interface AssessmentComparisonValue {
  readonly left?: number;
  readonly right?: number;
  readonly single?: number;
}

export interface AssessmentComparison {
  readonly testKey: string;
  readonly name: string;
  readonly unit: string;
  readonly betterDirection: BetterDirection;
  readonly baseline: AssessmentComparisonValue | null;
  readonly reassessment: AssessmentComparisonValue | null;
}

function toComparisonValue(result: AssessmentResultInput | undefined): AssessmentComparisonValue | null {
  if (!result) return null;
  return { left: result.valueLeft, right: result.valueRight, single: result.valueSingle };
}

export function buildBeforeAfterComparison(
  definitions: readonly AssessmentDefinition[],
  baselineResults: readonly AssessmentResultInput[],
  reassessmentResults: readonly AssessmentResultInput[]
): AssessmentComparison[] {
  const baselineByKey = new Map(baselineResults.map((r) => [r.testKey, r]));
  const reassessmentByKey = new Map(reassessmentResults.map((r) => [r.testKey, r]));

  return definitions.map((def) => ({
    testKey: def.testKey,
    name: def.name,
    unit: def.unit,
    betterDirection: def.betterDirection,
    baseline: toComparisonValue(baselineByKey.get(def.testKey)),
    reassessment: toComparisonValue(reassessmentByKey.get(def.testKey)),
  }));
}

export async function fetchAssessmentResults(
  sprintId: string,
  phase: 'baseline' | 'reassessment'
): Promise<AssessmentResultInput[]> {
  const { data: assessment, error: assessmentError } = await supabase
    .from('sprint_assessments')
    .select('id')
    .eq('sprint_id', sprintId)
    .eq('phase', phase)
    .maybeSingle();
  if (assessmentError) throw new Error(assessmentError.message);
  if (!assessment) return [];

  const { data: results, error: resultsError } = await supabase
    .from('sprint_assessment_results')
    .select('test_key, value_left, value_right, value_single, notes')
    .eq('sprint_assessment_id', (assessment as any).id);
  if (resultsError) throw new Error(resultsError.message);

  return ((results ?? []) as any[]).map((row) => ({
    testKey: row.test_key,
    valueLeft: row.value_left ?? undefined,
    valueRight: row.value_right ?? undefined,
    valueSingle: row.value_single ?? undefined,
    notes: row.notes ?? undefined,
  }));
}

export interface PastAssessment {
  readonly assessmentId: string;
  readonly sprintId: string;
  readonly phase: 'baseline' | 'reassessment';
  readonly cycleNumber: number;
  readonly completedAt: string;
  readonly results: AssessmentResultInput[];
}

/**
 * The user's completed assessments for one pain point (across every sprint,
 * either phase), newest first. `excludeSprintPhase` drops the assessment
 * currently being filled in, which could otherwise be its own "last" one.
 * RLS already restricts rows to the owner.
 */
export async function fetchAssessmentHistory(
  painPointId: string,
  limit: number,
  excludeSprintPhase?: { sprintId: string; phase: 'baseline' | 'reassessment' }
): Promise<PastAssessment[]> {
  const { data, error } = await supabase
    .from('sprint_assessments')
    .select('id, sprint_id, phase, completed_at, sprints!inner ( pain_point_id, cycle_number )')
    .eq('sprints.pain_point_id', painPointId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(limit + 1);
  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as any[])
    .filter((r) => !(excludeSprintPhase && r.sprint_id === excludeSprintPhase.sprintId && r.phase === excludeSprintPhase.phase))
    .slice(0, limit);
  if (rows.length === 0) return [];

  const { data: resultRows, error: resultsError } = await supabase
    .from('sprint_assessment_results')
    .select('sprint_assessment_id, test_key, value_left, value_right, value_single, notes')
    .in('sprint_assessment_id', rows.map((r) => r.id));
  if (resultsError) throw new Error(resultsError.message);

  return rows.map((r) => ({
    assessmentId: r.id,
    sprintId: r.sprint_id,
    phase: r.phase,
    cycleNumber: r.sprints?.cycle_number ?? 0,
    completedAt: r.completed_at,
    results: ((resultRows ?? []) as any[])
      .filter((x) => x.sprint_assessment_id === r.id)
      .map((x) => ({
        testKey: x.test_key,
        valueLeft: x.value_left ?? undefined,
        valueRight: x.value_right ?? undefined,
        valueSingle: x.value_single ?? undefined,
        notes: x.notes ?? undefined,
      })),
  }));
}

/**
 * Seeds the assessment form from a past assessment. Only keys the current
 * definitions still have are copied (definitions can change between
 * sprints); new tests stay empty. `??`-style null checks are deliberate so a
 * stored 0 (a pass/fail "Fail") survives.
 */
export function prefillDraft(
  definitions: readonly AssessmentDefinition[],
  past: PastAssessment | null
): Map<string, AssessmentResultInput> {
  const draft = new Map<string, AssessmentResultInput>();
  if (!past) return draft;
  const byKey = new Map(past.results.map((r) => [r.testKey, r]));
  for (const def of definitions) {
    const prior = byKey.get(def.testKey);
    if (!prior) continue;
    if (def.isBilateral) {
      if (prior.valueLeft == null && prior.valueRight == null) continue;
      draft.set(def.testKey, {
        testKey: def.testKey,
        valueLeft: prior.valueLeft ?? undefined,
        valueRight: prior.valueRight ?? undefined,
      });
    } else {
      if (prior.valueSingle == null) continue;
      draft.set(def.testKey, { testKey: def.testKey, valueSingle: prior.valueSingle });
    }
  }
  return draft;
}
