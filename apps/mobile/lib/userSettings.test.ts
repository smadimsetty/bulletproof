// apps/mobile/lib/userSettings.test.ts
import { DEFAULT_SETTINGS, fetchUserSettings, updateUserSettings } from './userSettings';

jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));
import { supabase } from './supabase';

function chain(result: any) {
  const c: any = {};
  for (const m of ['select', 'upsert']) c[m] = jest.fn(() => c);
  c.single = jest.fn(() => Promise.resolve(result));
  c.maybeSingle = jest.fn(() => Promise.resolve(result));
  return c;
}

const ROW = {
  weight_unit: 'kg', weekly_goal: 4, default_visibility: 'public', healthkit_write_enabled: true,
  notify_follows: false, notify_likes: true, notify_comments: false, notify_reports: true,
};

beforeEach(() => (supabase.from as jest.Mock).mockReset());

test('no row returns defaults', async () => {
  (supabase.from as jest.Mock).mockReturnValueOnce(chain({ data: null, error: null }));
  await expect(fetchUserSettings()).resolves.toEqual(DEFAULT_SETTINGS);
});

test('row maps to camelCase', async () => {
  (supabase.from as jest.Mock).mockReturnValueOnce(chain({ data: ROW, error: null }));
  await expect(fetchUserSettings()).resolves.toEqual({
    weightUnit: 'kg', weeklyGoal: 4, defaultVisibility: 'public', healthkitWriteEnabled: true,
    notifyFollows: false, notifyLikes: true, notifyComments: false, notifyReports: true,
  });
});

test('update upserts only the patched snake_case columns on owner_id', async () => {
  const c = chain({ data: ROW, error: null });
  (supabase.from as jest.Mock).mockReturnValueOnce(c);
  const saved = await updateUserSettings({ weeklyGoal: 4 });
  expect(c.upsert).toHaveBeenCalledWith({ weekly_goal: 4 }, { onConflict: 'owner_id' });
  expect(saved.weeklyGoal).toBe(4);
});

test('fetch error throws', async () => {
  (supabase.from as jest.Mock).mockReturnValueOnce(chain({ data: null, error: { message: 'boom' } }));
  await expect(fetchUserSettings()).rejects.toThrow('boom');
});
