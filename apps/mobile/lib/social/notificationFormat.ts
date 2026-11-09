// apps/mobile/lib/social/notificationFormat.ts
//
// Pure presentation + routing for inbox rows. Routes mirror the `data.url`
// paths the send-push Edge Function puts on push notifications, so tapping a
// row and tapping the push land in the same place.
import type { NotificationKind } from './notifications';

export function notificationText(kind: NotificationKind, handle: string | null): string {
  const who = handle ? `@${handle}` : 'Someone';
  switch (kind) {
    case 'follow_request':
      return `${who} wants to follow you`;
    case 'follow_accepted':
      return `${who} accepted your follow request`;
    case 'new_follower':
      return `${who} followed you`;
    case 'like':
      return `${who} liked your workout`;
    case 'comment':
      return `${who} commented on your workout`;
    case 'report':
      return 'New report to review';
  }
}

/** Where tapping a row (or its push) goes; null when there is nowhere useful. */
export function notificationRoute(n: {
  kind: NotificationKind;
  actorId: string | null;
  workoutId: string | null;
}): string | null {
  switch (n.kind) {
    case 'like':
    case 'comment':
      return n.workoutId ? `/workout-summary/${n.workoutId}` : null;
    case 'follow_request':
      return '/inbox';
    case 'follow_accepted':
    case 'new_follower':
      return n.actorId ? `/profile/${n.actorId}` : null;
    case 'report':
      return n.workoutId ? `/workout-summary/${n.workoutId}` : '/inbox';
  }
}

/** Only in-app paths from our own push payloads are ever navigated to. */
export function safePushRoute(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  return /^\/(workout-summary\/[\w-]+|profile\/[\w-]+|inbox)$/.test(url) ? url : null;
}
