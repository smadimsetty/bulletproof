// apps/mobile/lib/swapOptions.test.ts
import { fetchSwapOptions } from './swapOptions';

jest.mock('./supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from './supabase';

const profileRow = { preferred_split: 'push_pull_legs' };
const splitRows = [
  { id: 'upper_lower', label: 'Upper / Lower', day_labels: ['upper', 'lower'] },
  { id: 'push_pull_legs', label: 'Push / Pull / Legs', day_labels: ['push', 'pull', 'legs'] },
];
const activityRows = [
  { id: 'pickleball', label: 'Pickleball', category: 'cardio' },
  { id: 'running', label: 'Running', category: 'cardio' },
  { id: 'yoga', label: 'Yoga', category: 'recovery' },
  { id: 'mobility', label: 'Mobility', category: 'recovery' },
];

function installMocks() {
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    if (table === 'user_profile') {
      return { select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: profileRow, error: null }) }) };
    }
    if (table === 'split_taxonomy') {
      return { select: jest.fn().mockResolvedValue({ data: splitRows, error: null }) };
    }
    if (table === 'activity_taxonomy') {
      return { select: jest.fn().mockResolvedValue({ data: activityRows, error: null }) };
    }
    throw new Error(`unexpected table: ${table}`);
  });
}

describe('fetchSwapOptions', () => {
  test('groups Strength options from the preferred split\'s day_labels, Cardio/Recovery from activity_taxonomy', async () => {
    installMocks();

    const groups = await fetchSwapOptions();

    const strength = groups.find((g) => g.category === 'strength');
    expect(strength?.options.map((o) => o.id)).toEqual(['push', 'pull', 'legs']);

    const cardio = groups.find((g) => g.category === 'cardio');
    expect(cardio?.options.map((o) => o.id)).toEqual(['pickleball', 'running']);

    const recovery = groups.find((g) => g.category === 'recovery');
    expect(recovery?.options.map((o) => o.id)).toEqual(['yoga', 'mobility']);
  });
});
