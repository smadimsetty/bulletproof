import { OUTPUT_SCHEMAS, painPointBlock, systemPrompt, userBlock } from '../../../supabase/functions/sprint-coach/prompt';

test('the system prompt is identical across calls, so it can be cached', () => {
  expect(systemPrompt()).toBe(systemPrompt());
  expect(systemPrompt().length).toBeGreaterThan(200);
});

test('the pain point block is stable regardless of key order', () => {
  expect(painPointBlock({ b: 1, a: { d: 2, c: 3 } })).toBe(painPointBlock({ a: { c: 3, d: 2 }, b: 1 }));
});

test('the user block names the trigger', () => {
  expect(userBlock('pain', { x: 1 })).toContain('pain');
});

test('every output schema closes its objects', () => {
  const walk = (s: any): void => {
    if (s && typeof s === 'object') {
      if (s.type === 'object') {
        expect(s.additionalProperties).toBe(false);
        expect(Object.keys(s.properties).sort()).toEqual([...s.required].sort());
      }
      Object.values(s).forEach(walk);
    }
  };
  for (const k of ['start', 'pain', 'retest'] as const) walk(OUTPUT_SCHEMAS[k]);
});
