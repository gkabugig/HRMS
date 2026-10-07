"use server";

import { revalidatePath } from "next/cache";
import { toResult, type FormResult } from "@/lib/actions/form-result";
import { requireRewardHr, rewardAudit, todayIso } from "./context";
import { notifyDueLetters } from "./letters";

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();

// Sets the release date on held letters (all of them, or one) and tells the employee
// straight away when the date is today or earlier; later dates are picked up by the daily sweep.
export async function setLetterRelease(letterId: string | null, _prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const { supabase, userId, orgId } = await requireRewardHr();
    const date = str(formData.get("release_date"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose a release date.");
    let q = supabase.from("reward_letters").update({ release_date: date }).eq("org_id", orgId);
    q = letterId ? q.eq("id", letterId) : q.is("release_date", null);
    const { data, error } = await q.select("id");
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error("There are no held letters to release.");
    await rewardAudit(supabase, { orgId, actorUserId: userId, event: "letters.release_set", recordType: "reward_letter", recordId: letterId, after: { date, count: data.length } });
    if (date <= todayIso()) await notifyDueLetters(supabase, orgId);
    revalidatePath("/dashboard/rewards/letters");
  });
}
