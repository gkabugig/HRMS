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
  | "service_request";

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
};
