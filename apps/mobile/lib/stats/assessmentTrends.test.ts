// apps/mobile/lib/stats/assessmentTrends.test.ts
import { buildTestTrends } from './assessmentTrends';

// sprintAssessment pulls in the real supabase client at import time; only the
// pure changeVerdict is used here.
jest.mock('../supabase', () => ({ supabase: {} }));
import type { AssessmentDefinition, PastAssessment } from '../sprintAssessment';

const def = (p: Partial<AssessmentDefinition>): AssessmentDefinition => ({
  testKey: 'k', name: 'Knee to wall', instructions: '', unit: 'cm', targetDescription: '',
  betterDirection: 'higher', isBilateral: false, isSynthesized: false, ...p,
});

const assessment = (
  id: string, phase: 'baseline' | 'reassessment', at: string, results: PastAssessment['results']
): PastAssessment => ({ assessmentId: id, sprintId: 's1', phase, cycleNumber: 1, completedAt: at, results });

test('two assessments give two labelled points and a verdict', () => {
  const trends = buildTestTrends(
    [def({})],
    [
      assessment('b', 'baseline', '2026-10-01T10:00:00Z', [{ testKey: 'k', valueSingle: 8 }]),
      assessment('r', 'reassessment', '2026-10-15T10:00:00Z', [{ testKey: 'k', valueSingle: 11 }]),
    ]
  );
  expect(trends[0].points.map((p) => p.label)).toEqual(['C1 base', 'C1 re']);
  expect(trends[0].verdict).toBe('better');
});

test('input order does not matter and lower-is-better flips the verdict', () => {
  const [t] = buildTestTrends(
    [def({ betterDirection: 'lower' })],
    [
      assessment('r', 'reassessment', '2026-10-15T10:00:00Z', [{ testKey: 'k', valueSingle: 11 }]),
      assessment('b', 'baseline', '2026-10-01T10:00:00Z', [{ testKey: 'k', valueSingle: 8 }]),
    ]
  );
  expect(t.points[0].label).toBe('C1 base');
  expect(t.verdict).toBe('worse');
});

test('bilateral points carry left and right', () => {
  const [t] = buildTestTrends(
    [def({ isBilateral: true })],
    [
      assessment('b', 'baseline', '2026-10-01T10:00:00Z', [{ testKey: 'k', valueLeft: 5, valueRight: 7 }]),
      assessment('r', 'reassessment', '2026-10-15T10:00:00Z', [{ testKey: 'k', valueLeft: 8, valueRight: 9 }]),
    ]
  );
  expect(t.points[1]).toMatchObject({ left: 8, right: 9 });
  expect(t.isBilateral).toBe(true);
  expect(t.verdict).toBe('better');
});

test('definition without results has no points and null verdict; pass/fail flagged', () => {
  const [t] = buildTestTrends([def({ unit: 'pass/fail' })], [
    assessment('b', 'baseline', '2026-10-01T10:00:00Z', [{ testKey: 'other', valueSingle: 1 }]),
  ]);
  expect(t.points).toEqual([]);
  expect(t.verdict).toBeNull();
  expect(t.isPassFail).toBe(true);
});

test('single point has no verdict', () => {
  const [t] = buildTestTrends([def({})], [assessment('b', 'baseline', '2026-10-01T10:00:00Z', [{ testKey: 'k', valueSingle: 8 }])]);
  expect(t.points).toHaveLength(1);
  expect(t.verdict).toBeNull();
});
