jest.mock('./supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));

import { requestCoach } from './sprintCoach';
import { supabase } from './supabase';

const invoke = supabase.functions.invoke as jest.Mock;
beforeEach(() => invoke.mockReset());

test('posts the trigger and sprint id to sprint-coach', async () => {
  invoke.mockResolvedValue({ data: { ok: true }, error: null });
  requestCoach('pain', 'sp1');
  await Promise.resolve();
  expect(invoke).toHaveBeenCalledWith('sprint-coach', { body: { trigger: 'pain', sprintId: 'sp1' } });
});

test('never throws, whether the call rejects or throws synchronously', async () => {
  invoke.mockRejectedValue(new Error('offline'));
  expect(() => requestCoach('start', 'sp1')).not.toThrow();
  invoke.mockImplementation(() => { throw new Error('boom'); });
  expect(() => requestCoach('retest', 'sp1')).not.toThrow();
  await new Promise((r) => setTimeout(r, 0));
});
