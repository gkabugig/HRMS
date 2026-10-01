import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Area 17 §8.8 GET /api/compensation/employees/:employeeId — the
// "get_compensation_summary" shape Area 12's AI tool will call into.
// Access gated to HR/admin or the employee's own manager (RLS on
// employee_compensation_history already enforces self-read for the
// employee themselves; compensation_change_requests stays HR/manager-only
// per §8.5's stricter-than-profile-data rule).
export async function GET(request: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id, name, basic, house_allowance, transport_allowance, other_allowance")
    .eq("id", employeeId)
    .maybeSingle();
  if (employeeError) return NextResponse.json({ error: employeeError.message }, { status: 500 });
  if (!employee) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const [{ data: history }, { data: pendingChanges }] = await Promise.all([
    supabase
      .from("employee_compensation_history")
      .select("effective_from, effective_to, basic, house_allowance, transport_allowance, other_allowance, reason, grade_id")
      .eq("employee_id", employeeId)
      .order("effective_from", { ascending: false })
      .limit(10),
    supabase
      .from("compensation_change_requests")
      .select("id, status, effective_from, proposed_basic")
      .eq("employee_id", employeeId)
      .in("status", ["submitted", "approved", "scheduled"]),
  ]);

  return NextResponse.json({ employee, history: history ?? [], pendingChanges: pendingChanges ?? [] });
}
