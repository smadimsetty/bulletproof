export type Side = 'left' | 'right';
export type Direction = 'higher' | 'lower';

export interface EngineTest {
  testKey: string;
  betterDirection: Direction | 'symmetry';
  rawDirection: Direction | null;
  targetValue: number | null;
  noiseThreshold: number | null;
  isBilateral: boolean;
}

export interface TestResult {
  testKey: string;
  left: number | null;
  right: number | null;
  single: number | null;
}

export interface SlotLink {
  testKey: string;
  slotKey: string;
  weight: number;
}

export interface TestScore {
  testKey: string;
  deficit: number;
  weakerSide: Side | null;
}
