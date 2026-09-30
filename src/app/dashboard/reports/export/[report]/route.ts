import { createClient } from "@/lib/supabase/server";
import { csvResponse, currentYearRange, daysAgo, isLateClockIn, daysBetween } from "@/lib/reports";

// All the underlying tables are already RLS-scoped to admin/hr (see
// supabase/migrations/0002_rls.sql and 0008_compliance_fields.sql), so a
// manager or employee hitting this route directly simply gets an empty
// result set back, not someone else's data.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ report: string }> }
) {
  const { report } = await params;
  const supabase = await createClient();

  switch (report) {
    case "headcount": {
      const { data } = await supabase
        .from("employees")
        .select("staff_no, name, department, job_title, employment_type, date_of_hire, status")
        .order("department")
        .order("name");
      return csvResponse(
        "headcount.csv",
        (data ?? []).map((e) => ({
          staff_no: e.staff_no,
          name: e.name,
          department: e.department,
          job_title: e.job_title,
          employment_type: e.employment_type,
          date_of_hire: e.date_of_hire,
          status: e.status,
        }))
      );
    }

    case "payroll": {
      const { data: runs } = await supabase
        .from("payroll_runs")
        .select("id, period")
        .order("generated_at", { ascending: false })
        .limit(12);
      const runPeriodById = new Map((runs ?? []).map((r) => [r.id, r.period]));
      const { data } = runs && runs.length > 0
        ? await supabase
            .from("payslips")
            .select("payroll_run_id, gross, nssf, shif, housing_levy, paye, other_deductions, leave_deduction, net, employees(staff_no, name)")
            .in("payroll_run_id", runs.map((r) => r.id))
        : { data: [] as never[] };
      return csvResponse(
        "payroll.csv",
        (data ?? [])
          .map((p) => {
            const emp = p.employees as unknown as { staff_no: string; name: string } | null;
            return {
              period: runPeriodById.get(p.payroll_run_id) ?? "",
              staff_no: emp?.staff_no ?? "",
              name: emp?.name ?? "",
              gross: p.gross,
              leave_deduction: p.leave_deduction,
              nssf: p.nssf,
              shif: p.shif,
              housing_levy: p.housing_levy,
              paye: p.paye,
              other_deductions: p.other_deductions,
              net: p.net,
            };
          })
          .sort((a, b) => (a.period < b.period ? 1 : -1))
      );
    }

    case "leave": {
      const { start, end } = currentYearRange();
      const { data } = await supabase
        .from("leave_requests")
        .select("leave_type, start_date, end_date, days, status, applied_on, employees(staff_no, name)")
        .gte("start_date", start)
        .lte("start_date", end)
        .order("start_date", { ascending: false });
      return csvResponse(
        "leave.csv",
        (data ?? []).map((l) => {
          const emp = l.employees as unknown as { staff_no: string; name: string } | null;
          return {
            staff_no: emp?.staff_no ?? "",
            name: emp?.name ?? "",
            leave_type: l.leave_type,
            start_date: l.start_date,
            end_date: l.end_date,
            days: l.days,
            status: l.status,
            applied_on: l.applied_on,
          };
        })
      );
    }

    case "attendance": {
      const since = daysAgo(30);
      const { data } = await supabase
        .from("attendance")
        .select("work_date, clock_in, clock_out, employees(staff_no, name)")
        .gte("work_date", since)
        .order("work_date", { ascending: false });
      return csvResponse(
        "attendance.csv",
        (data ?? []).map((a) => {
          const emp = a.employees as unknown as { staff_no: string; name: string } | null;
          return {
            staff_no: emp?.staff_no ?? "",
            name: emp?.name ?? "",
            work_date: a.work_date,
            clock_in: a.clock_in,
            clock_out: a.clock_out,
            late: isLateClockIn(a.clock_in) ? "Yes" : "No",
            missing_clock_out: !a.clock_out ? "Yes" : "No",
          };
        })
      );
    }

    case "compliance": {
      const { data } = await supabase
        .from("compliance_documents")
        .select("doc_type, label, expiry_date, alert_threshold_days, employees(staff_no, name)")
        .order("expiry_date");
      const today = new Date().toISOString().slice(0, 10);
      return csvResponse(
        "compliance-documents.csv",
        (data ?? []).map((c) => {
          const emp = c.employees as unknown as { staff_no: string; name: string } | null;
          const daysToExpiry = daysBetween(today, c.expiry_date);
          return {
            staff_no: emp?.staff_no ?? "(org-wide)",
            name: emp?.name ?? "",
            doc_type: c.doc_type,
            label: c.label,
            expiry_date: c.expiry_date,
            days_to_expiry: daysToExpiry,
            status: daysToExpiry < 0 ? "Expired" : daysToExpiry <= c.alert_threshold_days ? "Expiring soon" : "OK",
          };
        })
      );
    }

    case "disciplinary": {
      const { start, end } = currentYearRange();
      const { data } = await supabase
        .from("disciplinary_actions")
        .select("hearing_date, action_type, reason, outcome, representative_present, employees(staff_no, name)")
        .gte("hearing_date", start)
        .lte("hearing_date", end)
        .order("hearing_date", { ascending: false });
      return csvResponse(
        "disciplinary.csv",
        (data ?? []).map((d) => {
          const emp = d.employees as unknown as { staff_no: string; name: string } | null;
          return {
            staff_no: emp?.staff_no ?? "",
            name: emp?.name ?? "",
            hearing_date: d.hearing_date,
            action_type: d.action_type,
            representative_present: d.representative_present ? "Yes" : "No",
            reason: d.reason,
            outcome: d.outcome ?? "",
          };
        })
      );
    }

    case "offboarding": {
      const { start, end } = currentYearRange();
      const { data } = await supabase
        .from("offboarding_records")
        .select(
          "exit_type, notice_date, last_working_day, status, severance_pay, employees(staff_no, name, department)"
        )
        .gte("notice_date", start)
        .lte("notice_date", end)
        .order("notice_date", { ascending: false });
      return csvResponse(
        "offboarding.csv",
        (data ?? []).map((o) => {
          const emp = o.employees as unknown as { staff_no: string; name: string; department: string } | null;
          return {
            staff_no: emp?.staff_no ?? "",
            name: emp?.name ?? "",
            department: emp?.department ?? "",
            exit_type: o.exit_type,
            notice_date: o.notice_date,
            last_working_day: o.last_working_day,
            severance_pay: o.severance_pay,
            status: o.status,
          };
        })
      );
    }

    case "recruitment": {
      const { data } = await supabase
        .from("candidates")
        .select("name, source, stage, added_on, requisitions(role, department, status)")
        .order("added_on", { ascending: false });
      return csvResponse(
        "recruitment.csv",
        (data ?? []).map((c) => {
          const req = c.requisitions as unknown as { role: string; department: string; status: string } | null;
          return {
            candidate: c.name,
            source: c.source ?? "",
            stage: c.stage,
            added_on: c.added_on,
            role: req?.role ?? "",
            department: req?.department ?? "",
            requisition_status: req?.status ?? "",
          };
        })
      );
    }

    default:
      return new Response("Unknown report", { status: 404 });
  }
}
