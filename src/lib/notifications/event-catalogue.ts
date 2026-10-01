// Area 09 §6 Event Taxonomy — stable event names, typed payloads and the
// recipient-selector/category/default-priority each one maps to. This is
// the single place new business events get registered; the orchestrator
// (orchestrator.ts) and the seed policy (seed-policy.ts) both key off this
// catalogue rather than hard-coding event names a second time.
//
// Event names are deliberately decoupled from UI components (spec §6) —
// nothing here imports from src/app/**.

import type { NotificationCategory, NotificationPriority } from "./notification-types";

export type RecipientSelector =
  | { kind: "employee"; employeeIdField: string }
  | { kind: "manager"; employeeIdField: string }
  | { kind: "manager_chain"; employeeIdField: string; maxDepth?: number }
  | { kind: "hr_role" }
  | { kind: "approver"; approverUserIdField: string }
  | { kind: "workflow_task_owner"; taskOwnerUserIdField: string }
  | { kind: "case_assignee"; assigneeUserIdField: string }
  | { kind: "department_role"; employeeIdField: string }
  | { kind: "static_user"; userIdField: string };

export type EventDefinition = {
  eventType: string;
  description: string;
  category: NotificationCategory;
  defaultPriority: NotificationPriority;
  mandatory: boolean;
  recipients: RecipientSelector[];
  /** Fields the payload must carry — validated loosely at emit time. */
  requiredPayloadFields: string[];
};

export const EVENT_CATALOGUE: Record<string, EventDefinition> = {
  // Area 11 §10.3 domain events: risk.detected -> Area 09 (this entry) and
  // Area 03 (remediation workflow, started separately when an action is
  // created); risk.resolved -> Area 10 (re-measure, no notification side
  // effect needed there) and Area 09 (this entry). ownerUserId is resolved
  // server-side by the risk engine (owner resolution, §6.6) before emit —
  // never a value supplied by the browser.
  "risk.detected": {
    eventType: "risk.detected",
    description: "A new (or reopened) workforce risk was detected and needs an owner's attention.",
    category: "risk",
    defaultPriority: "action_required",
    mandatory: false,
    recipients: [{ kind: "static_user", userIdField: "ownerUserId" }, { kind: "hr_role" }],
    requiredPayloadFields: ["riskId", "ruleCode"],
  },
  "risk.resolved": {
    eventType: "risk.resolved",
    description: "A workforce risk was marked resolved.",
    category: "risk",
    defaultPriority: "information",
    mandatory: false,
    recipients: [{ kind: "hr_role" }],
    requiredPayloadFields: ["riskId", "ruleCode"],
  },
  "approval.requested": {
    eventType: "approval.requested",
    description: "An approval step needs a decision from its assignee(s).",
    category: "approval",
    defaultPriority: "action_required",
    mandatory: true,
    recipients: [{ kind: "approver", approverUserIdField: "approverUserId" }],
    requiredPayloadFields: ["requestId", "stepId"],
  },
  "approval.approved": {
    eventType: "approval.approved",
    description: "An approval request was approved; confirm to the requester.",
    category: "approval",
    defaultPriority: "information",
    mandatory: false,
    recipients: [{ kind: "static_user", userIdField: "requesterUserId" }],
    requiredPayloadFields: ["requestId", "requesterUserId"],
  },
  "approval.rejected": {
    eventType: "approval.rejected",
    description: "An approval request was rejected/returned.",
    category: "approval",
    defaultPriority: "action_required",
    mandatory: false,
    recipients: [{ kind: "static_user", userIdField: "requesterUserId" }],
    requiredPayloadFields: ["requestId", "requesterUserId"],
  },
  "approval.escalated": {
    eventType: "approval.escalated",
    description: "An approval step was escalated to a new assignee.",
    category: "approval",
    defaultPriority: "action_required",
    mandatory: true,
    recipients: [{ kind: "approver", approverUserIdField: "approverUserId" }],
    requiredPayloadFields: ["requestId", "stepId"],
  },
  "workflow.task.assigned": {
    eventType: "workflow.task.assigned",
    description: "A workflow task was assigned to its owner.",
    category: "approval",
    defaultPriority: "action_required",
    mandatory: false,
    recipients: [{ kind: "workflow_task_owner", taskOwnerUserIdField: "ownerUserId" }],
    requiredPayloadFields: ["taskId", "ownerUserId"],
  },
  "workflow.task.overdue": {
    eventType: "workflow.task.overdue",
    description: "A workflow task passed its due date without completion.",
    category: "approval",
    defaultPriority: "critical",
    mandatory: true,
    recipients: [
      { kind: "workflow_task_owner", taskOwnerUserIdField: "ownerUserId" },
      { kind: "hr_role" },
    ],
    requiredPayloadFields: ["taskId", "ownerUserId"],
  },
  "hr.case.created": {
    eventType: "hr.case.created",
    description: "A new HR service case was created.",
    category: "service_request",
    defaultPriority: "information",
    mandatory: false,
    recipients: [{ kind: "hr_role" }],
    requiredPayloadFields: ["caseId"],
  },
  "hr.case.assigned": {
    eventType: "hr.case.assigned",
    description: "An HR service case was assigned to a handler.",
    category: "service_request",
    defaultPriority: "action_required",
    mandatory: false,
    recipients: [{ kind: "case_assignee", assigneeUserIdField: "assigneeUserId" }],
    requiredPayloadFields: ["caseId", "assigneeUserId"],
  },
  "hr.case.sla_warning": {
    eventType: "hr.case.sla_warning",
    description: "An HR service case is approaching its SLA deadline.",
    category: "service_request",
    defaultPriority: "action_required",
    mandatory: true,
    recipients: [{ kind: "case_assignee", assigneeUserIdField: "assigneeUserId" }, { kind: "hr_role" }],
    requiredPayloadFields: ["caseId"],
  },
  "hr.case.sla_breached": {
    eventType: "hr.case.sla_breached",
    description: "An HR service case missed its SLA deadline.",
    category: "service_request",
    defaultPriority: "critical",
    mandatory: true,
    recipients: [{ kind: "hr_role" }],
    requiredPayloadFields: ["caseId"],
  },
  "document.acknowledgement.required": {
    eventType: "document.acknowledgement.required",
    description: "An employee must read/acknowledge a specific document version.",
    category: "documents",
    defaultPriority: "action_required",
    mandatory: true,
    recipients: [{ kind: "employee", employeeIdField: "employeeId" }],
    requiredPayloadFields: ["documentId", "employeeId"],
  },
  "document.expiry.warning": {
    eventType: "document.expiry.warning",
    description: "A document is approaching its expiry date.",
    category: "documents",
    defaultPriority: "reminder",
    mandatory: false,
    recipients: [{ kind: "employee", employeeIdField: "employeeId" }, { kind: "hr_role" }],
    requiredPayloadFields: ["documentId", "employeeId"],
  },
  "document.expired": {
    eventType: "document.expired",
    description: "A document has expired and requires action.",
    category: "documents",
    defaultPriority: "action_required",
    mandatory: true,
    recipients: [{ kind: "employee", employeeIdField: "employeeId" }, { kind: "hr_role" }],
    requiredPayloadFields: ["documentId", "employeeId"],
  },
  "document.issued": {
    eventType: "document.issued",
    description: "A new document is available to the employee.",
    category: "documents",
    defaultPriority: "information",
    mandatory: false,
    recipients: [{ kind: "employee", employeeIdField: "employeeId" }],
    requiredPayloadFields: ["documentId", "employeeId"],
  },
};

export function getEventDefinition(eventType: string): EventDefinition | null {
  return EVENT_CATALOGUE[eventType] ?? null;
}
