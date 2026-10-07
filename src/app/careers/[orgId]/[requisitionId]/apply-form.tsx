"use client";

import ActionForm from "@/components/forms/action-form";
import { applyForJob } from "../../actions";

const input = "w-full border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 px-3 py-2 bg-white text-neutral-900";

export default function ApplyForm({ requisitionId }: { requisitionId: string }) {
  return (
    <ActionForm
      action={applyForJob.bind(null, requisitionId)}
      className="space-y-3 text-sm"
      successMessage="Thank you! Your application has been received. We'll be in touch if you are shortlisted."
    >
      <label className="block">
        <span className="text-xs text-neutral-600">Full name</span>
        <input name="name" required autoComplete="name" className={input} />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-neutral-600">Email</span>
          <input name="email" type="email" required autoComplete="email" className={input} />
        </label>
        <label className="block">
          <span className="text-xs text-neutral-600">Phone</span>
          <input name="phone" type="tel" required autoComplete="tel" className={input} />
        </label>
      </div>
      <label className="block">
        <span className="text-xs text-neutral-600">CV (PDF or Word, up to 5 MB)</span>
        <input name="cv" type="file" accept=".pdf,.doc,.docx" className="block text-xs mt-1" />
      </label>
      {/* Hidden from people; automated form-fillers tend to complete it. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px" }}>
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="flex items-start gap-2 text-xs text-neutral-600">
        <input type="checkbox" name="consent" required className="mt-0.5" />
        <span>I agree that my details and CV may be stored and used to consider me for this job, in line with the Data Protection Act, 2019.</span>
      </label>
      <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-5 py-2 font-medium">
        Submit application
      </button>
    </ActionForm>
  );
}
