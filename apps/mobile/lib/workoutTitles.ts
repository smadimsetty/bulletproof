export function defaultWorkoutTitle(startedAt: Date): string {
  const h = startedAt.getHours();
  if (h < 12) return 'Morning workout';
  if (h < 17) return 'Afternoon workout';
  return 'Evening workout';
}

export function sprintWorkoutTitle(painPointName: string, dayNumber: number): string {
  return `${painPointName} · Day ${dayNumber}`;
}

export function sprintTargetText(prescribedSets: number | null, text: string | null): string | null {
  const trimmed = text?.trim() || null;
  if (prescribedSets && trimmed) return `${prescribedSets} × ${trimmed}`;
  if (trimmed) return trimmed;
  if (prescribedSets) return `${prescribedSets} sets`;
  return null;
}
