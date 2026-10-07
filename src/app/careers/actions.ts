"use server";

// Public job applications. Nobody is signed in here, so everything is checked
// on the server: the job must really be open to the public, the org comes from
// the job (never from the form), and all writes use the service-role client
// with a fixed, narrow set of fields.
import { toResult, type FormResult } from "@/lib/actions/form-result";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateApplication, isAcceptingApplications, UUID, kenyaToday } from "@/lib/recruitment/application";
import { validateCv, storeCv } from "@/lib/recruitment/cv";

const MAX_PER_HOUR = 100; // per organisation, stops a flood of fake applications

export async function applyForJob(requisitionId: string, _prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    // Hidden field real people never fill in.
    if (String(formData.get("website") ?? "").trim() !== "") return;
    if (!UUID.test(requisitionId)) throw new Error("This job is no longer available.");

    const input = {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      consent: formData.get("consent") === "on",
    };
    const invalid = validateApplication(input);
    if (invalid) throw new Error(invalid);

    const cv = formData.get("cv");
    const cvFile = cv instanceof File && cv.size > 0 ? cv : null;
    const cvError = validateCv(cvFile);
    if (cvError) throw new Error(cvError);

    const admin = createAdminClient();
    const { data: job } = await admin
      .from("requisitions")
      .select("id, org_id, role, status, approval_status, published, closing_date")
      .eq("id", requisitionId)
      .maybeSingle();
    const today = kenyaToday(); // Kenya date
    if (!job || !isAcceptingApplications(job, today)) throw new Error("Sorry, this job is no longer accepting applications.");

    const since = new Date(Date.now() - 3600_000).toISOString();
    const { data: orgJobs } = await admin.from("requisitions").select("id").eq("org_id", job.org_id);
    const { count } = await admin
      .from("candidates")
      .select("id", { count: "exact", head: true })
      .in("requisition_id", (orgJobs ?? []).map((j) => j.id as string))
      .eq("applied_via", "careers")
      .gte("added_on", since);
    if ((count ?? 0) >= MAX_PER_HOUR) throw new Error("We're receiving a lot of applications right now. Please try again in a little while.");

    const { data: created, error } = await admin
      .from("candidates")
      .insert({
        requisition_id: job.id,
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        phone: input.phone.trim(),
        source: "Careers page",
        applied_via: "careers",
        stage: "Applied",
        data_consent_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) {
      throw new Error(error.code === "23505" ? "You have already applied for this job. We have your application." : "Couldn't submit your application. Please try again.");
    }

    if (cvFile) {
      try {
        const path = await storeCv(admin, job.id, created.id, cvFile);
        await admin.from("candidates").update({ cv_path: path }).eq("id", created.id);
      } catch {
        await admin.from("candidates").delete().eq("id", created.id);
        throw new Error("We couldn't upload your CV. Please try again, or apply without it.");
      }
    }

    // Tell HR (best effort: never fail an application over a notification).
    try {
      const { data: hr } = await admin.from("app_users").select("id").eq("org_id", job.org_id).in("role", ["admin", "hr"]);
      if (hr?.length) {
        await admin.from("notifications").insert(
          hr.map((u) => ({
            org_id: job.org_id,
            recipient_user_id: u.id,
            type: "NEW_APPLICATION",
            category: "recruitment",
            priority: "information",
            title: "New job application",
            message: `${input.name.trim()} applied for ${job.role}.`,
            entity_type: "candidate",
            entity_id: created.id,
            action_url: `/dashboard/recruitment/${job.id}/${created.id}`,
          }))
        );
      }
    } catch {
      /* ignore */
    }
  });
}
