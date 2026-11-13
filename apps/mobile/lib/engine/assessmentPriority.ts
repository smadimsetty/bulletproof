import type { Direction, EngineTest, Side, SlotLink, TestResult, TestScore } from './types';

export const PRIORITY_FLOOR = 0.2;
export const SYMMETRY_TARGET = 0.9;

const fin = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n);

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Noise threshold as a positive number, or 0 when absent. */
function noiseOf(test: EngineTest): number {
  return fin(test.noiseThreshold) && test.noiseThreshold > 0 ? test.noiseThreshold : 0;
}

export function scoreTest(test: EngineTest, result: TestResult | undefined): TestScore {
  const zero: TestScore = { testKey: test.testKey, deficit: 0, weakerSide: null };
  if (!result) return zero;

  const dir: Direction | null =
    test.betterDirection === 'symmetry' ? test.rawDirection : test.betterDirection;
  const noise = noiseOf(test);

  const left = test.isBilateral && fin(result.left) ? result.left : null;
  const right = test.isBilateral && fin(result.right) ? result.right : null;
  const single = !test.isBilateral && fin(result.single) ? result.single : null;

  // Raw term: the weaker value against the target.
  const present: number[] = test.isBilateral
    ? [left, right].filter(fin)
    : single !== null
      ? [single]
      : [];
  let raw = 0;
  if (dir && fin(test.targetValue) && present.length > 0) {
    const weakest = dir === 'higher' ? Math.min(...present) : Math.max(...present);
    const shortfall = dir === 'higher' ? test.targetValue - weakest : weakest - test.targetValue;
    const absTarget = Math.abs(test.targetValue);
    const denom = absTarget > 0 ? absTarget : 10 * noise;
    raw = shortfall > 0 && denom > 0 ? clamp01(shortfall / denom) : 0;
  }

  // Symmetry term (bilateral only).
  let symmetry = 0;
  let weakerSide: Side | null = null;
  if (test.isBilateral && left !== null && right !== null) {
    const gap = Math.abs(left - right);
    if (left > 0 && right > 0) {
      // Better-side/worse-side ratio is the smaller over the larger for both directions.
      const ratio = Math.min(left, right) / Math.max(left, right);
      symmetry = clamp01((SYMMETRY_TARGET - ratio) / SYMMETRY_TARGET);
    } else if (noise > 0) {
      symmetry = clamp01(gap / (10 * noise));
    }
    if (dir && gap > noise && gap > 0) {
      const leftIsLower = left < right;
      weakerSide =
        dir === 'higher' ? (leftIsLower ? 'left' : 'right') : leftIsLower ? 'right' : 'left';
    }
  }

  return { testKey: test.testKey, deficit: clamp01(Math.max(raw, symmetry)), weakerSide };
}

export function slotPriorities(
  scores: readonly TestScore[],
  links: readonly SlotLink[],
): Map<string, number> {
  const byKey = new Map(scores.map((s) => [s.testKey, s]));
  const out = new Map<string, number>();
  for (const l of links) {
    const deficit = byKey.get(l.testKey)?.deficit ?? 0;
    const w = fin(l.weight) ? l.weight : 0;
    out.set(l.slotKey, (out.get(l.slotKey) ?? 0) + w * (PRIORITY_FLOOR + deficit));
  }
  return out;
}

export function weakerSideBySlot(
  scores: readonly TestScore[],
  links: readonly SlotLink[],
): Map<string, Side> {
  const byKey = new Map(scores.map((s) => [s.testKey, s]));
  const best = new Map<string, { deficit: number; side: Side }>();
  for (const l of links) {
    const s = byKey.get(l.testKey);
    if (!s || !s.weakerSide) continue;
    const cur = best.get(l.slotKey);
    if (!cur || s.deficit > cur.deficit) {
      best.set(l.slotKey, { deficit: s.deficit, side: s.weakerSide });
    }
  }
  return new Map([...best].map(([k, v]) => [k, v.side]));
}
