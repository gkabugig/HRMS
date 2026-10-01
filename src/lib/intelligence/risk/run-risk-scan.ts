import type { SupabaseClient } from "@supabase/supabase-js";
import { emitNotificationEvent } from "@/lib/notifications/outbox";
import { processEventImmediately } from "@/lib/notifications/scheduler";
import { createAdminClient } from "@/lib/supabase/admin";

// Area 11 §6.6 rule engine: Area 10 metric/transaction event -> rule
// selector -> eligibility -> evidence collector -> condition evaluation ->
// score + severity -> deterministic dedupe -> risk create/update -> owner
// resolution (Area 04) -> workflow remediation (Area 03, left to a
// human-created workforce_risk_action, not auto-started) -> notification/
// escalation (Area 09) -> verification + closure (manual, via actions.ts).
//
// Only the rules with is_active=true in workforce_risk_rules (migration
// 0104) are evaluated here; DOC-MISS-001, CONTRACT-EXP-001, POS-VAC-001,
// COMP-001 and INTEGRATION-001 are seeded as definitions but not yet
// wired, for the reasons recorded in that migration's comments.
type Finding = {
  ruleCode: string;
  title: string;
  description: string;
  entityType: string;
  entityId: string | null;
  evidence: Record<string, unknown>[];
  // Per-finding override of the rule's default weights, when the engine
  // has a sharper read than the rule's static default (e.g. urgency
  // scales with how overdue something is).
  weightOverrides?: Partial<{ impact: number; likelihood: number; urgency: number; confidence: number }>;
};

function severityFromScore(score: number): "low" | "medium" | "high" | "critical" {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

async function resolveOwner(supabase: SupabaseClient, orgId: string, entityType: string, entityId: string | null): Promise<{ ownerUserId: string | null; ownerRole: string }> {
  // §6.6 "Owner resolution (Area 04)". For an employee-scoped risk, the
  // owner is the employee's reporting manager's app_user account; HR is
  // the fallback owner for everything else (no generalised "owner for
  // every entity type" resolver exists outside the employee/manager
  // relationship Area 04 already provides).
  if (entityType === "employee" && entityId) {
    const { data: emp } = await supabase.from("employees").select("reporting_manager_id").eq("id", entityId).maybeSingle();
    if (emp?.reporting_manager_id) {
      const { data: managerUser } = await supabase
        .from("app_users")
        .select("id")
        .eq("org_id", orgId)
        .eq("employee_id", emp.reporting_manager_id)
        .maybeSingle();
      if (managerUser) return { ownerUserId: managerUser.id, ownerRole: "manager" };
    }
  }
  const { data: hrUser } = await supabase.from("app_users").select("id").eq("org_id", orgId).eq("role", "hr").limit(1).maybeSingle();
  return { ownerUserId: hrUser?.id ?? null, ownerRole: "hr" };
}

export async function runRiskScan(supabase: SupabaseClient, orgId: string, actorUserId: string | null): Promise<{ created: number; reopened: number; findings: number }> {
  const { data: rules } = await supabase.from("workforce_risk_rules").select("*").eq("org_id", orgId).eq("is_active", true);
  const ruleByCode = new Map((rules ?? []).map((r) => [r.code, r]));

  const findings: Finding[] = [];
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // DOC-EXP-001 — compliance document within its alert window.
  if (ruleByCode.has("DOC-EXP-001")) {
    const { data: docs } = await supabase
      .from("compliance_documents")
      .select("id, employee_id, doc_type, label, expiry_date, alert_threshold_days, employees(name, staff_no)")
      .not("expiry_date", "is", null);
    for (const d of docs ?? []) {
      if (!d.expiry_date) continue;
      const daysToExpiry = Math.ceil((new Date(d.expiry_date).getTime() - today.getTime()) / 86400000);
      if (daysToExpiry <= (d.alert_threshold_days ?? 30) && daysToExpiry >= 0) {
        const emp = d.employees as unknown as { name: string; staff_no: string } | null;
        findings.push({
          ruleCode: "DOC-EXP-001",
          title: `${d.label ?? d.doc_type} expiring in ${daysToExpiry} day(s)`,
          description: `${emp?.name ?? "Employee"} (${emp?.staff_no ?? d.employee_id})'s ${d.label ?? d.doc_type} expires ${d.expiry_date}.`,
          entityType: "employee",
          entityId: d.employee_id,
          evidence: [{ compliance_document_id: d.id, expiry_date: d.expiry_date, days_to_expiry: daysToExpiry }],
          weightOverrides: { urgency: daysToExpiry <= 7 ? 0.95 : 0.6 },
        });
      }
    }
  }

  // PROBATION-001 — probation ended without a recorded decision.
  if (ruleByCode.has("PROBATION-001")) {
    const { data: employees } = await supabase
      .from("employees")
      .select("id, name, staff_no, status, probation_end_date")
      .eq("status", "Active")
      .not("probation_end_date", "is", null)
      .lt("probation_end_date", todayStr);
    for (const e of employees ?? []) {
      findings.push({
        ruleCode: "PROBATION-001",
        title: `Probation overdue for ${e.name}`,
        description: `${e.name} (${e.staff_no})'s probation ended ${e.probation_end_date} with no recorded confirmation.`,
        entityType: "employee",
        entityId: e.id,
        evidence: [{ probation_end_date: e.probation_end_date }],
      });
    }
  }

  // APPROVAL-001 — approval open longer than the rule's configured stale_days.
  if (ruleByCode.has("APPROVAL-001")) {
    const staleDays = (ruleByCode.get("APPROVAL-001")?.threshold_config as { stale_days?: number } | null)?.stale_days ?? 7;
    const threshold = new Date(today);
    threshold.setDate(threshold.getDate() - staleDays);
    const { data: approvals } = await supabase
      .from("approval_requests")
      .select("id, request_type, status, created_at, requested_by")
      .in("status", ["draft", "submitted", "pending_approval", "returned"])
      .lt("created_at", threshold.toISOString());
    for (const a of approvals ?? []) {
      const ageDays = Math.floor((today.getTime() - new Date(a.created_at).getTime()) / 86400000);
      findings.push({
        ruleCode: "APPROVAL-001",
        title: `Approval request exceeds SLA (${ageDays}d)`,
        description: `A ${a.request_type} approval request has been open for ${ageDays} days.`,
        entityType: "approval_request",
        entityId: a.id,
        evidence: [{ created_at: a.created_at, age_days: ageDays, status: a.status }],
        weightOverrides: { urgency: Math.min(0.5 + ageDays / 30, 0.95) },
      });
    }
  }

  // CASE-SLA-001 — HR case past its SLA due date, unresolved.
  if (ruleByCode.has("CASE-SLA-001")) {
    const { data: cases } = await supabase
      .from("service_requests")
      .select("id, subject, sla_due_at, resolved_at")
      .not("sla_due_at", "is", null)
      .is("resolved_at", null)
      .lt("sla_due_at", today.toISOString());
    for (const c of cases ?? []) {
      findings.push({
        ruleCode: "CASE-SLA-001",
        title: `HR case SLA breached: ${c.subject}`,
        description: `Case "${c.subject}" passed its SLA due date (${c.sla_due_at}) unresolved.`,
        entityType: "service_request",
        entityId: c.id,
        evidence: [{ sla_due_at: c.sla_due_at }],
      });
    }
  }

  // DATA-MGR-001 / DATA-POS-001 — sourced from Area 10's own data-quality
  // findings rather than re-querying employees/positions a second time.
  if (ruleByCode.has("DATA-MGR-001") || ruleByCode.has("DATA-POS-001")) {
    const codes = [];
    if (ruleByCode.has("DATA-MGR-001")) codes.push("missing_manager");
    if (ruleByCode.has("DATA-POS-001")) codes.push("inactive_position_assignment");
    const { data: dqEvents } = await supabase
      .from("analytics_data_quality_events")
      .select("id, issue_code, entity_type, entity_id, description")
      .eq("org_id", orgId)
      .in("issue_code", codes)
      .is("resolved_at", null);
    for (const dq of dqEvents ?? []) {
      const ruleCode = dq.issue_code === "missing_manager" ? "DATA-MGR-001" : "DATA-POS-001";
      findings.push({
        ruleCode,
        title: dq.description,
        description: dq.description,
        entityType: dq.entity_type,
        entityId: dq.entity_id,
        evidence: [{ data_quality_event_id: dq.id }],
      });
    }
  }

  // OT-001 — org-level overtime metric exceeds the rule's threshold.
  // Granularity note: Area 10's overtime_hours metric is an org-wide
  // aggregate (no per-employee overtime ledger exists), so this rule can
  // only raise one org-level risk, not flag individual employees.
  if (ruleByCode.has("OT-001")) {
    const thresholdHours = (ruleByCode.get("OT-001")?.threshold_config as { threshold_hours?: number } | null)?.threshold_hours ?? 40;
    const { data: snap } = await supabase
      .from("metric_snapshots")
      .select("value")
      .eq("org_id", orgId)
      .eq("metric_key", "overtime_hours")
      .eq("dimension_key", "all")
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (snap && Number(snap.value) > thresholdHours) {
      findings.push({
        ruleCode: "OT-001",
        title: `Organisation-wide overtime exceeds threshold`,
        description: `Recorded overtime (${Number(snap.value).toFixed(1)}h, trailing 30 days) exceeds the configured threshold of ${thresholdHours}h.`,
        // entity_id uses the org's own id as a stand-in for "the whole
        // organisation" — the natural-key unique constraint treats two
        // NULL entity_ids as distinct (standard SQL), which would break
        // dedupe for this org-level-only rule if left null.
        entityType: "organisation",
        entityId: orgId,
        evidence: [{ overtime_hours: snap.value, threshold_hours: thresholdHours }],
      });
    }
  }

  // ACK-001 — mandatory acknowledgement overdue.
  if (ruleByCode.has("ACK-001")) {
    const overdueDays = (ruleByCode.get("ACK-001")?.threshold_config as { overdue_days?: number } | null)?.overdue_days ?? 14;
    const threshold = new Date(today);
    threshold.setDate(threshold.getDate() - overdueDays);
    const { data: acks } = await supabase
      .from("document_acknowledgements")
      .select("id, employee_id, created_at, status, employees(name, staff_no)")
      .neq("status", "acknowledged")
      .lt("created_at", threshold.toISOString());
    for (const a of acks ?? []) {
      const emp = a.employees as unknown as { name: string; staff_no: string } | null;
      findings.push({
        ruleCode: "ACK-001",
        title: `Acknowledgement overdue for ${emp?.name ?? a.employee_id}`,
        description: `${emp?.name ?? "Employee"} has not acknowledged a required document since it was issued.`,
        entityType: "employee",
        entityId: a.employee_id,
        evidence: [{ document_acknowledgement_id: a.id, status: a.status }],
      });
    }
  }

  // Deterministic dedupe + create/reopen, scored, owner-resolved, notified.
  let created = 0;
  let reopened = 0;
  const admin = createAdminClient();
  for (const f of findings) {
    const rule = ruleByCode.get(f.ruleCode);
    if (!rule) continue;

    // Skip if an active, unexpired suppression covers this rule+entity.
    let suppressionQuery = supabase
      .from("workforce_risk_suppressions")
      .select("id")
      .eq("org_id", orgId)
      .eq("rule_id", rule.id)
      .eq("entity_type", f.entityType)
      .gt("ends_at", new Date().toISOString());
    suppressionQuery = f.entityId ? suppressionQuery.eq("entity_id", f.entityId) : suppressionQuery.is("entity_id", null);
    const { data: suppression } = await suppressionQuery.maybeSingle();
    if (suppression) continue;

    const impact = f.weightOverrides?.impact ?? Number(rule.default_impact_weight);
    const likelihood = f.weightOverrides?.likelihood ?? Number(rule.default_likelihood_weight);
    const urgency = f.weightOverrides?.urgency ?? Number(rule.default_urgency_weight);
    const confidence = f.weightOverrides?.confidence ?? Number(rule.default_confidence_weight);
    const riskScore = Math.round(impact * likelihood * urgency * confidence * 100 * 100) / 100;
    const severity = severityFromScore(riskScore);

    let existingQuery = supabase
      .from("workforce_risks")
      .select("id, status")
      .eq("org_id", orgId)
      .eq("rule_id", rule.id)
      .eq("entity_type", f.entityType);
    existingQuery = f.entityId ? existingQuery.eq("entity_id", f.entityId) : existingQuery.is("entity_id", null);
    const { data: existing } = await existingQuery.maybeSingle();

    const wasClosed = existing && ["closed", "dismissed", "resolved", "verified"].includes(existing.status);
    const { ownerUserId, ownerRole } = await resolveOwner(supabase, orgId, f.entityType, f.entityId);

    const { data: riskRow, error } = await supabase
      .from("workforce_risks")
      .upsert(
        {
          org_id: orgId,
          rule_id: rule.id,
          rule_code: f.ruleCode,
          title: f.title,
          description: f.description,
          category: rule.category,
          status: wasClosed || !existing ? "detected" : existing.status,
          impact_weight: impact,
          likelihood_weight: likelihood,
          urgency_weight: urgency,
          confidence_weight: confidence,
          risk_score: riskScore,
          severity,
          entity_type: f.entityType,
          entity_id: f.entityId,
          evidence_json: f.evidence,
          owner_user_id: ownerUserId,
          owner_role: ownerRole,
          last_detected_at: new Date().toISOString(),
        },
        { onConflict: "org_id,rule_id,entity_type,entity_id" }
      )
      .select("id")
      .single();

    if (error || !riskRow) continue;

    if (!existing) created++;
    else if (wasClosed) reopened++;

    await supabase.from("workforce_risk_events").insert({
      risk_id: riskRow.id,
      event_type: existing ? (wasClosed ? "reopened" : "redetected") : "created",
      from_status: existing?.status ?? null,
      to_status: "detected",
      actor_user_id: actorUserId,
      note: `Detected by rule ${f.ruleCode}.`,
    });

    // Notify only on a genuinely new or reopened risk — not on every
    // redetect of an already-open one, which would just spam the owner.
    if (!existing || wasClosed) {
      const eventId = await emitNotificationEvent(supabase, {
        orgId,
        eventType: "risk.detected",
        aggregateType: "workforce_risk",
        aggregateId: riskRow.id,
        actorId: actorUserId,
        idempotencyKey: `risk-detected:${riskRow.id}:${new Date().toISOString().slice(0, 10)}`,
        payload: { riskId: riskRow.id, ruleCode: f.ruleCode, ownerUserId, severity },
      });
      if (eventId) await processEventImmediately(admin, eventId).catch((err) => console.error("processEventImmediately failed:", err));
    }
  }

  return { created, reopened, findings: findings.length };
}
