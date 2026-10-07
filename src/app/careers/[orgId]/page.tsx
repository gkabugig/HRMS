import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID, kenyaToday } from "@/lib/recruitment/application";

export const dynamic = "force-dynamic";

export default async function CareersPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!UUID.test(orgId)) notFound();
  const admin = createAdminClient();
  const today = kenyaToday();

  const [{ data: org }, { data: jobs }] = await Promise.all([
    admin.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    admin
      .from("requisitions")
      .select("id, role, department, location, employment_type, closing_date")
      .eq("org_id", orgId)
      .eq("published", true)
      .eq("status", "Open")
      .eq("approval_status", "Approved")
      .or(`closing_date.is.null,closing_date.gte.${today}`)
      .order("raised_on", { ascending: false }),
  ]);
  if (!org) notFound();

  return (
    <div>
      <h1 className="text-2xl font-semibold">Careers at {org.name}</h1>
      <p className="text-sm text-neutral-600 mt-1">Open positions. Choose a role to read more and apply.</p>
      <ul className="mt-6 space-y-3">
        {(jobs ?? []).map((j) => (
          <li key={j.id} className="bg-white border border-neutral-200 rounded-xl p-4">
            <Link href={`/careers/${orgId}/${j.id}`} className="font-medium text-brand-700 hover:underline">
              {j.role}
            </Link>
            <p className="text-sm text-neutral-600">
              {[j.department, j.location, j.employment_type].filter(Boolean).join(" · ")}
              {j.closing_date && ` · closes ${j.closing_date}`}
            </p>
          </li>
        ))}
        {(jobs ?? []).length === 0 && <li className="text-sm text-neutral-500">There are no open positions right now. Please check back soon.</li>}
      </ul>
    </div>
  );
}
