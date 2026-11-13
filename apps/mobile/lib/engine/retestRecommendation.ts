// Stay or switch after a retest (spec 2026-11-12 §5.4/§5.5): stay on the same pain point
// while a test is still clearly short of target or a real side gap remains; otherwise switch.
// "Clearly" means beyond the test's noise threshold. Pure.
import { scoreTest } from './assessmentPriority';
import type { EngineTest, TestResult } from './types';

export type StayOrSwitch = 'stay' | 'switch';

const fin = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);

/** How far the weakest present value falls short of target, in the test's direction (0 if none). */
function shortfall(test: EngineTest, r: TestResult): number {
  const dir = test.betterDirection === 'symmetry' ? test.rawDirection : test.betterDirection;
  if (!dir || !fin(test.targetValue)) return 0;
  const values = test.isBilateral ? [r.left, r.right].filter(fin) : [r.single].filter(fin);
  if (values.length === 0) return 0;
  const weakest = dir === 'higher' ? Math.min(...values) : Math.max(...values);
  return Math.max(0, dir === 'higher' ? test.targetValue - weakest : weakest - test.targetValue);
}

export function recommendStayOrSwitch(
  tests: readonly EngineTest[],
  retest: readonly TestResult[],
  names: Readonly<Record<string, string>> = {},
): { choice: StayOrSwitch; reason: string } {
  const byKey = new Map(retest.map((r) => [r.testKey, r]));
  for (const t of tests) {
    const r = byKey.get(t.testKey);
    if (!r) continue;
    const name = names[t.testKey] ?? t.testKey;
    const score = scoreTest(t, r);
    if (score.weakerSide) {
      return {
        choice: 'stay',
        reason: `Your ${score.weakerSide} side still trails on ${name}. Another cycle can close that gap.`,
      };
    }
    const noise = fin(t.noiseThreshold) && t.noiseThreshold > 0 ? t.noiseThreshold : 0;
    if (score.deficit > 0 && shortfall(t, r) > noise) {
      return { choice: 'stay', reason: `${name.charAt(0).toUpperCase()}${name.slice(1)} is still short of target. Another cycle can get it there.` };
    }
  }
  return { choice: 'switch', reason: 'Your tests are at or near target. A good time to work on something new.' };
}

export interface Recommendation {
  choice: StayOrSwitch;
  reason: string;
  suggestedPainPointId: string | null;
  source: 'ai' | 'rules';
}

/** The coach's stored recommendation (sprints.retest_recommendation) when it is well-formed, else the rules'. */
export function pickRecommendation(ai: unknown, rules: { choice: StayOrSwitch; reason: string }): Recommendation {
  const a = ai as Record<string, unknown> | null;
  if (a && typeof a === 'object' && (a.choice === 'stay' || a.choice === 'switch') && typeof a.reason === 'string' && a.reason.trim()) {
    return {
      choice: a.choice,
      reason: a.reason.trim(),
      suggestedPainPointId: typeof a.suggested_pain_point_id === 'string' ? a.suggested_pain_point_id : null,
      source: 'ai',
    };
  }
  return { ...rules, suggestedPainPointId: null, source: 'rules' };
}
