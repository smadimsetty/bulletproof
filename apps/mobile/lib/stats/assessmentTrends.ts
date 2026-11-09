// apps/mobile/lib/stats/assessmentTrends.ts
//
// Per-test series across every completed assessment of one pain point, for
// the Progress tab's line charts. Pure: callers fetch definitions and
// assessments (fetchAllAssessments filtered to the pain point).
import {
  changeVerdict,
  type AssessmentDefinition,
  type BetterDirection,
  type PastAssessment,
} from '../sprintAssessment';

export interface TrendPoint {
  /** e.g. "C1 base", "C1 re". */
  label: string;
  date: string;
  left?: number;
  right?: number;
  single?: number;
}

export interface TestTrend {
  testKey: string;
  name: string;
  unit: string;
  betterDirection: BetterDirection;
  isBilateral: boolean;
  isPassFail: boolean;
  points: TrendPoint[];
  /** First point vs latest point; null with fewer than two points. */
  verdict: 'better' | 'worse' | 'same' | null;
}

export function pointLabel(a: Pick<PastAssessment, 'cycleNumber' | 'phase'>): string {
  return `C${a.cycleNumber} ${a.phase === 'baseline' ? 'base' : 're'}`;
}

export function buildTestTrends(
  definitions: readonly AssessmentDefinition[],
  assessments: readonly PastAssessment[]
): TestTrend[] {
  const ordered = [...assessments].sort((a, b) => a.completedAt.localeCompare(b.completedAt));

  return definitions.map((def) => {
    const points: TrendPoint[] = [];
    for (const a of ordered) {
      const r = a.results.find((x) => x.testKey === def.testKey);
      if (!r) continue;
      points.push({
        label: pointLabel(a),
        date: a.completedAt,
        left: r.valueLeft,
        right: r.valueRight,
        single: r.valueSingle,
      });
    }

    let verdict: TestTrend['verdict'] = null;
    if (points.length >= 2) {
      const first = points[0];
      const last = points[points.length - 1];
      verdict = changeVerdict({
        testKey: def.testKey,
        name: def.name,
        unit: def.unit,
        betterDirection: def.betterDirection,
        baseline: { left: first.left, right: first.right, single: first.single },
        reassessment: { left: last.left, right: last.right, single: last.single },
      });
    }

    return {
      testKey: def.testKey,
      name: def.name,
      unit: def.unit,
      betterDirection: def.betterDirection,
      isBilateral: def.isBilateral,
      isPassFail: def.unit === 'pass/fail',
      points,
      verdict,
    };
  });
}
