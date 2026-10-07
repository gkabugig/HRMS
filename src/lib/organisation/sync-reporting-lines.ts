import type { SupabaseClient } from "@supabase/supabase-js";

// Two places record "who reports to whom":
//  - employees.reporting_manager_id  (the "Reports to" box on the employee
//    form; also what the Org chart draws), and
//  - reporting_relationships         (the authoritative, effective-dated
//    record that the organisation data-quality checks read).
// Saving an employee only wrote the first, so people could look correctly
// placed on the chart yet still be flagged "no current line manager". These
// helpers copy the first into the second.
const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);

export async function syncReportingLine(supabase: SupabaseClient, employeeId: string, managerId: string | null): Promise<boolean> {
  if (!managerId || managerId === employeeId) return false;

  const { data: open } = await supabase
    .from("reporting_relationships")
    .select("id, manager_id, effective_from")
    .eq("employee_id", employeeId)
    .eq("relationship_type", "line_manager")
    .eq("is_primary", true)
    .is("effective_to", null)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (open?.manager_id === managerId) return false;

  if (open) {
    if ((open.effective_from as string) >= today()) {
      // Started today: just correct it rather than closing and re-opening on the same day.
      const { error } = await supabase.from("reporting_relationships").update({ manager_id: managerId }).eq("id", open.id);
      if (error) throw new Error(error.message);
      return true;
    }
    const { error: closeErr } = await supabase
      .from("reporting_relationships")
      .update({ effective_to: yesterday() })
      .eq("id", open.id);
    if (closeErr) throw new Error(closeErr.message);
  }

  const { error } = await supabase.from("reporting_relationships").insert({
    employee_id: employeeId,
    manager_id: managerId,
    relationship_type: "line_manager",
    is_primary: true,
    effective_from: today(),
  });
  if (error) throw new Error(error.message);
  return true;
}

// Brings every active employee's authoritative reporting line in line with
// their "Reports to" field. Returns how many were created or corrected.
export async function syncAllReportingLines(supabase: SupabaseClient, orgId: string): Promise<number> {
  const { data: employees } = await supabase
    .from("employees")
    .select("id, reporting_manager_id")
    .eq("org_id", orgId)
    .eq("status", "Active")
    .not("reporting_manager_id", "is", null);

  let changed = 0;
  for (const e of employees ?? []) {
    if (await syncReportingLine(supabase, e.id as string, e.reporting_manager_id as string)) changed++;
  }
  return changed;
}
