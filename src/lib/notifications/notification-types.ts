export type NotificationCategory =
  | "leave"
  | "attendance"
  | "payroll"
  | "compliance"
  | "training"
  | "performance"
  | "recruitment"
  | "offboarding"
  | "documents"
  | "system"
  | "self_service"
  | "service_request"
  | "approval";

export type NotificationPriority = "critical" | "action_required" | "reminder" | "information";

export type NotificationRow = {
  id: string;
  type: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  action_url: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  expires_at: string | null;
  // Area 09 additions — nullable because they're absent on notifications
  // created by pre-Area-09 direct callers that never passed them.
  safe_preview: string | null;
  action_label: string | null;
  correlation_id: string | null;
  requires_action: boolean;
  is_mandatory: boolean;
  escalation_stage: number;
};

export type CreateNotificationInput = {
  orgId: string;
  recipientUserId: string;
  type: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  expiresAt?: string;
  // Area 09 additions — all optional so every pre-Area-09 call site
  // (leave, attendance, payroll, training, etc.) compiles and behaves
  // identically without passing any of these.
  actionLabel?: string;
  /** External-channel-safe summary. If omitted, email/SMS adapters fall
   * back to a generic "sign in to review" line rather than `message`,
   * since `message` may contain internal detail (spec §2/§29). */
  safePreview?: string;
  /** Set when this notification is the product of the governed
   * notification_events outbox pipeline (Area 09 orchestrator), never by
   * a direct legacy caller. */
  eventId?: string;
  templateId?: string;
  correlationId?: string;
  requiresAction?: boolean;
  /** Only honoured by the DB function when eventId is also set AND a
   * matching mandatory notification_policy_rules row exists — see
   * create_notification_secure(). A legacy caller passing this without
   * eventId will have the whole call rejected, not silently downgraded,
   * so no caller can believe it sent a mandatory notice when it didn't. */
  isMandatory?: boolean;
  scheduledFor?: string;
  escalationStage?: number;
  escalatedFromId?: string;
};
