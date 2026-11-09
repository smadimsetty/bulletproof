// apps/mobile/lib/social/reportReasons.ts
//
// Pure data for the report flow (matches content_reports.reason's check constraint).
export type ReportReason = 'spam' | 'harassment' | 'nudity' | 'hate' | 'violence' | 'other';
export type ReportTargetType = 'workout' | 'comment' | 'user';

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'nudity', label: 'Nudity or sexual content' },
  { value: 'hate', label: 'Hate speech' },
  { value: 'violence', label: 'Violence or threats' },
  { value: 'other', label: 'Something else' },
];

/** Friendly text for a failed report insert. 23505 = the unique (reporter, type, target) index. */
export function reportFailureMessage(error: { code?: string; message: string }): string {
  if (error.code === '23505') return 'You already reported this.';
  return error.message;
}
