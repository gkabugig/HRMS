import { createClient } from "@/lib/supabase/server";
import { getEmployee360 } from "@/lib/employees/get-employee-360";
import type { UserRole } from "@/lib/auth/roles";
import { EmployeeHeader } from "./components/employee-header";
import { EmployeeTabs, parseTab } from "./components/employee-tabs";
import { EmployeeOverview } from "./components/employee-overview";
import { BioTab } from "./components/bio-tab";
import { EmploymentTab } from "./components/employment-tab";
import { PayrollTab } from "./components/payroll-tab";
import { AttendanceTab } from "./components/attendance-tab";
import { LeaveTab } from "./components/leave-tab";
import { PerformanceTab } from "./components/performance-tab";
import { LearningTab } from "./components/learning-tab";
import { ComplianceTab } from "./components/compliance-tab";
import { DocumentsTab } from "./components/documents-tab";
import { AssetsTab } from "./components/assets-tab";
import { ActivityTab } from "./components/activity-tab";

export default async function Employee360Page({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { employeeId } = await params;
  const { tab } = await searchParams;
  const activeTab = parseTab(tab);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("role, employee_id")
    .eq("id", user!.id)
    .maybeSingle();

  const role = (appUser?.role ?? "employee") as UserRole;
  const isHrLike = role === "admin" || role === "hr";
  const isManagerLike = isHrLike || role === "manager";

  let data;
  try {
    data = await getEmployee360(supabase, employeeId, { role, employeeId: appUser?.employee_id ?? null });
  } catch {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <h1 className="text-lg font-semibold text-neutral-900 mb-2">Employee not found</h1>
        <p className="text-sm text-neutral-500">
          This profile doesn&apos;t exist, or you don&apos;t have permission to view it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <EmployeeHeader data={data} canEdit={isHrLike} />
      <EmployeeTabs employeeId={employeeId} active={activeTab} />

      {activeTab === "overview" && <EmployeeOverview data={data} employeeId={employeeId} />}
      {activeTab === "bio" && <BioTab data={data} employeeId={employeeId} canManageContacts={isHrLike} />}
      {activeTab === "employment" && (
        <EmploymentTab data={data} employeeId={employeeId} canAddNote={isManagerLike} canSeeNotes={isManagerLike} />
      )}
      {activeTab === "payroll" && <PayrollTab data={data} />}
      {activeTab === "attendance" && <AttendanceTab data={data} />}
      {activeTab === "leave" && <LeaveTab data={data} />}
      {activeTab === "performance" && <PerformanceTab data={data} />}
      {activeTab === "learning" && <LearningTab data={data} />}
      {activeTab === "compliance" && <ComplianceTab data={data} canSeeDisciplinary={isManagerLike} />}
      {activeTab === "documents" && <DocumentsTab data={data} employeeId={employeeId} canUpload={isHrLike} />}
      {activeTab === "assets" && <AssetsTab data={data} employeeId={employeeId} canManage={isHrLike} />}
      {activeTab === "activity" && <ActivityTab data={data} />}
    </div>
  );
}
