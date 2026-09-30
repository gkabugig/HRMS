// Payroll Command Centre for a single period (see
// HRMS_Payroll_Command_Centre_Build_Specification.docx). Everything here
// is fed by one server-side aggregator (getPayrollCommandCentre) plus the
// separately-paginated register, rather than one query per widget.
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPayrollCommandCentre } from "@/lib/payroll/get-command-centre";
import { getPayrollRegister } from "@/lib/payroll/get-payroll-register";
import { nextStatuses } from "@/lib/payroll/state-machine";
import PayrollHeader from "./components/payroll-header";
import PayrollKpis from "./components/payroll-kpis";
import PayrollWorkflow from "./components/payroll-workflow";
import PayrollHealth from "./components/payroll-health";
import PayrollExceptions from "./components/payroll-exceptions";
import PayrollChangesCard from "./components/payroll-changes";
import StatutorySummary from "./components/statutory-summary";
import ReconciliationPanel from "./components/reconciliation-panel";
import PayrollRegister from "./components/payroll-register";
import ApprovalPanel from "./components/approval-panel";
import PayslipCentre from "./components/payslip-centre";
import OutputCentre from "./components/output-centre";
import AuditTrail from "./components/audit-trail";

export default async function PayrollRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ payrollRunId: string }>;
  searchParams: Promise<{ page?: string; search?: string; department?: string; status?: string }>;
}) {
  const { payrollRunId } = await params;
  const sp = await searchParams;

  const data = await getPayrollCommandCentre(payrollRunId);
  if (!data) notFound();

  const { context, run, availableRuns, kpis, exceptions, health, changes, statutory, reconciliation, approvals, outputs, auditEvents, canManage, canSeeIndividualSalary } = data;

  const supabase = await createClient();
  const [{ count: publishedCount }, register] = await Promise.all([
    supabase.from("payslips").select("id", { count: "exact", head: true }).eq("payroll_run_id", run.id).not("published_at", "is", null),
    getPayrollRegister(
      supabase,
      run.id,
      { page: sp.page ? Number(sp.page) : 1, search: sp.search, department: sp.department, status: sp.status as "Ready" | "Exception" | undefined },
      canSeeIndividualSalary
    ),
  ]);

  if (!canManage) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <h1 className="text-lg font-semibold text-neutral-900 mb-2">Payroll Command Centre</h1>
        <p className="text-sm text-neutral-500">
          This view is restricted to payroll administrators. Use the Payroll menu for your own payslips.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PayrollHeader run={run} orgName={context.orgName} availableRuns={availableRuns} />
      <PayrollKpis kpis={kpis} />
      <PayrollWorkflow runId={run.id} status={run.status} locked={run.locked} next={nextStatuses(run.status)} canManage={canManage} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PayrollHealth checks={health} />
        <PayrollExceptions runId={run.id} exceptions={exceptions} canManage={canManage} locked={run.locked} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PayrollChangesCard runId={run.id} changes={changes} />
        <StatutorySummary lines={statutory} />
      </div>

      <ReconciliationPanel checks={reconciliation} />

      <PayrollRegister
        runId={run.id}
        rows={register.rows}
        total={register.total}
        page={register.page}
        pageSize={register.pageSize}
        departments={register.departments}
        filters={{ search: sp.search, department: sp.department, status: sp.status }}
        canSeeSalary={canSeeIndividualSalary}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ApprovalPanel approvals={approvals} />
        <PayslipCentre runId={run.id} employeeCount={run.employeeCount} publishedCount={publishedCount ?? 0} status={run.status} canManage={canManage} />
        <OutputCentre runId={run.id} status={run.status} outputs={outputs} canManage={canManage} />
      </div>

      <AuditTrail events={auditEvents} />
    </div>
  );
}
