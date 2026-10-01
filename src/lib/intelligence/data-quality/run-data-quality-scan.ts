import type { SupabaseClient } from "@supabase/supabase-js";

// Area 10 §5.9 data-quality intelligence. Scans authoritative tables for the
// listed finding types and upserts one open analytics_data_quality_events
// row per (issue_code, entity_type, entity_id) — the partial unique index
// (migration 0100) makes re-running the scan idempotent instead of piling
// up duplicate open findings. Runs opportunistically when the Data Quality
// screen is viewed (this app has no background job runner — same pattern
// as metric snapshots and the notification reminder sweep).
//
// Scope note (disclosed, not silently skipped): three of the ten §5.9
// checks are deferred rather than approximated into something misleading:
//   - "Missing required document": there is no per-org configuration of
//     which document/compliance types are mandatory for all employees
//     (document_types has no such flag), so there is no reliable
//     population to check against yet.
//   - "Compensation outside band": Area 17 (compensation grades/bands)
//     does not exist yet. Wired in once Area 17 lands (spec §11.1 step 24).
//   - "Orphaned workflow/case/document reference": the polymorphic
//     entity_type/entity_id references this would need to check (e.g.
//     workflow_tasks, notifications) are not FK-enforced, but a general
//     orphan scanner across every such reference is a larger undertaking
//     than this pass covers; left for a follow-up iteration.
export type DataQualityIssueCode =
  | "missing_manager"
  | "inactive_position_assignment"
  | "multiple_primary_positions"
  | "missing_employment_dates"
  | "invalid_org_relationship"
  | "duplicate_identifier"
  | "invalid_or_expired_position";

type Finding = {
  issue_code: DataQualityIssueCode;
  issue_category: string;
  entity_type: string;
  entity_id: string | null;
  severity: "low" | "medium" | "high";
  description: string;
  details: Record<string, unknown>;
};

export async function runDataQualityScan(supabase: SupabaseClient, orgId: string): Promise<{ findings: Finding[]; written: number }> {
  const findings: Finding[] = [];
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: employees }, { data: employeePositions }, { data: positions }] = await Promise.all([
    supabase.from("employees").select("id, name, staff_no, national_id, department, status, date_of_hire, reporting_manager_id").eq("status", "Active"),
    supabase
      .from("employee_positions")
      .select("id, employee_id, position_id, is_primary, effective_to, positions(id, is_active, organisation_unit_id, effective_to)")
      .is("effective_to", null),
    supabase.from("positions").select("id, title, is_active, organisation_unit_id, effective_to"),
  ]);

  // 1. Missing manager — active employee with no reporting manager set.
  for (const e of employees ?? []) {
    if (!e.reporting_manager_id) {
      findings.push({
        issue_code: "missing_manager",
        issue_category: "data_quality",
        entity_type: "employee",
        entity_id: e.id,
        severity: "medium",
        description: `${e.name} (${e.staff_no}) has no reporting manager assigned.`,
        details: { staff_no: e.staff_no, department: e.department },
      });
    }
    if (!e.date_of_hire) {
      findings.push({
        issue_code: "missing_employment_dates",
        issue_category: "data_quality",
        entity_type: "employee",
        entity_id: e.id,
        severity: "high",
        description: `${e.name} (${e.staff_no}) is missing a hire date.`,
        details: { staff_no: e.staff_no },
      });
    }
  }

  // 6. Duplicate employee identifiers — staff_no or national_id reused.
  const byStaffNo = new Map<string, string[]>();
  const byNationalId = new Map<string, string[]>();
  for (const e of employees ?? []) {
    if (e.staff_no) byStaffNo.set(e.staff_no, [...(byStaffNo.get(e.staff_no) ?? []), e.id]);
    if (e.national_id) byNationalId.set(e.national_id, [...(byNationalId.get(e.national_id) ?? []), e.id]);
  }
  for (const [staffNo, ids] of byStaffNo) {
    if (ids.length > 1) {
      findings.push({
        issue_code: "duplicate_identifier",
        issue_category: "data_quality",
        entity_type: "employee",
        entity_id: ids[0],
        severity: "high",
        description: `Staff number ${staffNo} is used by ${ids.length} employee records.`,
        details: { staff_no: staffNo, employee_ids: ids },
      });
    }
  }
  for (const [, ids] of byNationalId) {
    if (ids.length > 1) {
      findings.push({
        issue_code: "duplicate_identifier",
        issue_category: "data_quality",
        entity_type: "employee",
        entity_id: ids[0],
        severity: "high",
        description: `National ID is used by ${ids.length} employee records.`,
        details: { employee_ids: ids, field: "national_id" },
      });
    }
  }

  // 2 & 3. Position-assignment checks.
  type EpRow = {
    id: string;
    employee_id: string;
    position_id: string;
    is_primary: boolean;
    positions: { id: string; is_active: boolean; organisation_unit_id: string | null; effective_to: string | null } | null;
  };
  const eps = (employeePositions ?? []) as unknown as EpRow[];
  for (const ep of eps) {
    if (ep.positions && !ep.positions.is_active) {
      findings.push({
        issue_code: "inactive_position_assignment",
        issue_category: "data_quality",
        entity_type: "employee",
        entity_id: ep.employee_id,
        severity: "medium",
        description: `Employee is currently assigned to an inactive position.`,
        details: { position_id: ep.position_id },
      });
    }
    if (ep.positions && !ep.positions.organisation_unit_id) {
      findings.push({
        issue_code: "invalid_org_relationship",
        issue_category: "data_quality",
        entity_type: "position",
        entity_id: ep.position_id,
        severity: "low",
        description: `Position has no valid organisation unit link.`,
        details: {},
      });
    }
  }
  const primaryByEmployee = new Map<string, number>();
  for (const ep of eps) {
    if (ep.is_primary) primaryByEmployee.set(ep.employee_id, (primaryByEmployee.get(ep.employee_id) ?? 0) + 1);
  }
  for (const [employeeId, count] of primaryByEmployee) {
    if (count > 1) {
      findings.push({
        issue_code: "multiple_primary_positions",
        issue_category: "data_quality",
        entity_type: "employee",
        entity_id: employeeId,
        severity: "high",
        description: `Employee has ${count} active primary position assignments; exactly one is expected.`,
        details: { count },
      });
    }
  }

  // 8. Invalid/expired position — active flag true but effective_to in the past.
  for (const p of positions ?? []) {
    if (p.is_active && p.effective_to && p.effective_to < today) {
      findings.push({
        issue_code: "invalid_or_expired_position",
        issue_category: "data_quality",
        entity_type: "position",
        entity_id: p.id,
        severity: "medium",
        description: `Position "${p.title}" is marked active but its effective period ended ${p.effective_to}.`,
        details: { effective_to: p.effective_to },
      });
    }
  }

  // Upsert on the natural key (migration 0101). Re-detecting a previously
  // resolved issue reopens the same row (resolved_at -> null) rather than
  // creating a parallel one; an already-open row just gets its
  // description/details/detected_at refreshed.
  let written = 0;
  if (findings.length > 0) {
    const rows = findings.map((f) => ({
      org_id: orgId,
      issue_code: f.issue_code,
      issue_category: f.issue_category,
      entity_type: f.entity_type,
      entity_id: f.entity_id,
      severity: f.severity,
      description: f.description,
      details: f.details,
      detected_at: new Date().toISOString(),
      resolved_at: null,
      resolved_by: null,
      resolution_note: null,
    }));
    const { error, count } = await supabase
      .from("analytics_data_quality_events")
      .upsert(rows, { onConflict: "org_id,issue_code,entity_type,entity_id", count: "exact" });
    if (!error) written = count ?? rows.length;
  }

  return { findings, written };
}
