// The rules-template plan summary shown on the sprint screen until (or unless) the
// coach's own summary arrives (spec 2026-11-12 §5.5). Pure.
import { scoreTest } from './assessmentPriority';
import type { EngineTest, TestResult } from './types';

export function planSummaryFallback(
  tests: readonly EngineTest[],
  baseline: readonly TestResult[],
  names: Readonly<Record<string, string>>,
): string | null {
  if (baseline.length === 0) return null;
  const byKey = new Map(baseline.map((r) => [r.testKey, r]));
  const ranked = tests
    .map((t) => ({ key: t.testKey, deficit: scoreTest(t, byKey.get(t.testKey)).deficit }))
    .filter((s) => s.deficit > 0)
    .sort((a, b) => b.deficit - a.deficit || (a.key < b.key ? -1 : 1));
  const name = (key: string) => names[key] ?? key;
  if (ranked.length === 0) return 'Your tests are near target, so this plan keeps every area ticking over.';
  if (ranked.length === 1) return `Your plan targets ${name(ranked[0].key)} first.`;
  return `Your plan targets ${name(ranked[0].key)} first, then ${name(ranked[1].key)}.`;
}
