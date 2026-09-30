import { createClient } from "@/lib/supabase/server";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

export default async function CertificateOfServicePage({
  params,
}: {
  params: Promise<{ offboardingId: string }>;
}) {
  const { offboardingId } = await params;
  const supabase = await createClient();

  const [{ data: record }, { data: org }] = await Promise.all([
    supabase
      .from("offboarding_records")
      .select("last_working_day, status, employees(name, staff_no, job_title, department, date_of_hire)")
      .eq("id", offboardingId)
      .single(),
    supabase.from("organizations").select("name").eq("id", DEFAULT_ORG_ID).single(),
  ]);

  if (!record || record.status !== "Completed") {
    return (
      <p className="text-sm text-neutral-500">
        Certificate is available once offboarding is marked complete.
      </p>
    );
  }

  const employee = record.employees as unknown as {
    name: string;
    staff_no: string;
    job_title: string;
    department: string;
    date_of_hire: string;
  } | null;

  if (!employee) return <p className="text-sm text-neutral-500">Employee record not found.</p>;

  return (
    <div className="max-w-2xl mx-auto space-y-6 print:mx-0">
      <div className="flex justify-between items-center print:hidden">
        <p className="text-sm text-neutral-500">
          Employment Act s.51 — issued to every employee (except under 4 consecutive weeks' service)
          on termination. Deliberately omits the reason for leaving, to avoid prejudicing future
          employment.
        </p>
      </div>

      <div className="bg-white border border-neutral-200 rounded-lg p-10 print:border-none print:p-0">
        <h1 className="text-lg font-semibold text-center mb-8">CERTIFICATE OF SERVICE</h1>

        <p className="text-sm leading-7 text-neutral-800">
          This is to certify that <strong>{employee.name}</strong> (Staff No. {employee.staff_no}) was
          employed by <strong>{org?.name ?? "the organization"}</strong> as a{" "}
          <strong>{employee.job_title}</strong> in the {employee.department} department, from{" "}
          <strong>{employee.date_of_hire}</strong> to <strong>{record.last_working_day}</strong>.
        </p>

        <p className="text-sm text-neutral-500 mt-8">Issued pursuant to Section 51 of the Employment Act, 2007.</p>

        <div className="mt-16 grid grid-cols-2 gap-8 text-sm">
          <div>
            <div className="border-t border-neutral-400 pt-1">Authorized signature</div>
          </div>
          <div>
            <div className="border-t border-neutral-400 pt-1">Date</div>
          </div>
        </div>
      </div>

      <p className="print:hidden text-xs text-neutral-500">
        Use your browser's Print (Cmd/Ctrl+P) to save this as a PDF.
      </p>
    </div>
  );
}
