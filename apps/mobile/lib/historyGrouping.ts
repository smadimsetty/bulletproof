// Local-time, Monday-start week grouping + duration labels for History.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 24 * 60 * 60 * 1000;

export function weekStartMonday(d: Date): Date {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (start.getDay() + 6) % 7; // Mon=0 ... Sun=6
  start.setDate(start.getDate() - offset);
  return start;
}

export function weekLabel(weekStart: Date, now: Date): string {
  const thisWeek = weekStartMonday(now);
  const diffWeeks = Math.round((thisWeek.getTime() - weekStart.getTime()) / (7 * DAY_MS));
  if (diffWeeks === 0) return 'This week';
  if (diffWeeks === 1) return 'Last week';
  return `Week of Mon ${weekStart.getDate()} ${MONTHS[weekStart.getMonth()]}`;
}

export function groupByWeek<T extends { readonly startedAt: string }>(
  items: readonly T[],
  now: Date
): { label: string; items: T[] }[] {
  const groups: { key: number; label: string; items: T[] }[] = [];
  for (const item of items) {
    const start = weekStartMonday(new Date(item.startedAt));
    const key = start.getTime();
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, label: weekLabel(start, now), items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups.map(({ label, items: groupItems }) => ({ label, items: groupItems }));
}

export function durationLabel(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return '';
  const minutes = Math.max(1, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
