/** Client-safe notification preference event types (no server imports). */
export const NOTIFICATION_EVENTS = [
  "funding.deadline",
  "procurement.closing",
  "event.reminder",
  "programme.update",
  "submission.update",
  "organisation.claim",
  "correction.update",
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENTS)[number];
