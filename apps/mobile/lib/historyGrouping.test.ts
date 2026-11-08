import { weekStartMonday, weekLabel, groupByWeek, durationLabel } from './historyGrouping';

// Local-time constructors on purpose: grouping is in the user's local week.
const now = new Date(2026, 10, 7, 12, 0); // Sat 7 Nov 2026

test('weekStartMonday', () => {
  expect(weekStartMonday(now)).toEqual(new Date(2026, 10, 2));
  expect(weekStartMonday(new Date(2026, 10, 2, 0, 5))).toEqual(new Date(2026, 10, 2));
  expect(weekStartMonday(new Date(2026, 10, 1, 23, 0))).toEqual(new Date(2026, 9, 26)); // Sunday -> previous Monday
});

test('weekLabel', () => {
  expect(weekLabel(new Date(2026, 10, 2), now)).toBe('This week');
  expect(weekLabel(new Date(2026, 9, 26), now)).toBe('Last week');
  expect(weekLabel(new Date(2026, 9, 19), now)).toBe('Week of Mon 19 Oct');
});

test('groupByWeek keeps input order inside groups', () => {
  const items = [
    { id: 'a', startedAt: new Date(2026, 10, 6, 18).toISOString() },
    { id: 'b', startedAt: new Date(2026, 10, 3, 18).toISOString() },
    { id: 'c', startedAt: new Date(2026, 9, 30, 18).toISOString() },
  ];
  expect(groupByWeek(items, now)).toEqual([
    { label: 'This week', items: [items[0], items[1]] },
    { label: 'Last week', items: [items[2]] },
  ]);
});

test('durationLabel', () => {
  expect(durationLabel('2026-11-07T10:00:00Z', '2026-11-07T10:42:20Z')).toBe('42 min');
  expect(durationLabel('2026-11-07T10:00:00Z', '2026-11-07T11:05:00Z')).toBe('1 h 5 min');
  expect(durationLabel('2026-11-07T10:00:00Z', '2026-11-07T10:00:20Z')).toBe('1 min');
  expect(durationLabel('2026-11-07T10:00:00Z', null)).toBe('');
});
