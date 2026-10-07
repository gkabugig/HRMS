import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID, isAcceptingApplications, kenyaToday } from "@/lib/recruitment/application";
import ApplyForm from "./apply-form";

export const dynamic = "force-dynamic";

export default async function JobPage({ params }: { params: Promise<{ orgId: string; requisitionId: string }> }) {
  const { orgId, requisitionId } = await params;
  if (!UUID.test(orgId) || !UUID.test(requisitionId)) notFound();
  const admin = createAdminClient();
  const today = kenyaToday();

  const [{ data: org }, { data: job }] = await Promise.all([
    admin.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    admin
      .from("requisitions")
      .select("id, role, department, location, employment_type, closing_date, description, requirements, status, approval_status, published")
      .eq("id", requisitionId)
      .eq("org_id", orgId)
      .maybeSingle(),
  ]);
  if (!org || !job || !job.published) notFound();
  const open = isAcceptingApplications(job, today);

  return (
    <div>
      <Link href={`/careers/${orgId}`} className="text-sm text-brand-700 hover:underline">
        ← All jobs at {org.name}
      </Link>
      <h1 className="text-2xl font-semibold mt-2">{job.role}</h1>
      <p className="text-sm text-neutral-600">
        {[job.department, job.location, job.employment_type].filter(Boolean).join(" · ")}
        {job.closing_date && ` · closes ${job.closing_date}`}
      </p>
      {job.description && (
        <section className="mt-6">
          <h2 className="font-medium mb-1">About the job</h2>
          <p className="text-sm text-neutral-700 whitespace-pre-wrap">{job.description}</p>
        </section>
      )}
      {job.requirements && (
        <section className="mt-5">
          <h2 className="font-medium mb-1">Requirements</h2>
          <p className="text-sm text-neutral-700 whitespace-pre-wrap">{job.requirements}</p>
        </section>
      )}
      <section className="mt-8 bg-white border border-neutral-200 rounded-xl p-5">
        <h2 className="font-medium mb-3">Apply for this job</h2>
        {open ? <ApplyForm requisitionId={job.id} /> : <p className="text-sm text-neutral-600">This job is no longer accepting applications.</p>}
      </section>
    </div>
  );
}
