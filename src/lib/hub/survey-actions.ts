"use server";

import { revalidatePath } from "next/cache";
import { toResult, type FormResult } from "@/lib/actions/form-result";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireEmployeeCtx, requireHrCtx, str, notify, userIdsWhere, type Db } from "./context";
import { parseQuestions, TEMPLATES } from "./survey-engine";

async function insertSurvey(c: Awaited<ReturnType<typeof requireHrCtx>>, i: { title: string; description: string | null; kind: string; questions: { prompt: string; qtype: string }[] }) {
  if (i.questions.length === 0) throw new Error("Add at least one question.");
  if (i.questions.length > 30) throw new Error("A survey can have at most 30 questions.");
  const { data: s, error } = await c.supabase.from("surveys").insert({ org_id: c.orgId, title: i.title, description: i.description, kind: i.kind, created_by: c.userId }).select("id").single();
  if (error) throw new Error(error.message);
  const { error: qe } = await c.supabase.from("survey_questions").insert(i.questions.map((q, n) => ({ survey_id: s.id, position: n + 1, prompt: q.prompt, qtype: q.qtype })));
  if (qe) {
    await c.supabase.from("surveys").delete().eq("id", s.id);
    throw new Error(qe.message);
  }
}

export async function createSurvey(_prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireHrCtx();
    const title = str(formData.get("title"));
    const kind = ["pulse", "engagement", "wellbeing"].includes(str(formData.get("kind"))) ? str(formData.get("kind")) : "pulse";
    if (!title) throw new Error("Give the survey a title.");
    await insertSurvey(c, { title, description: str(formData.get("description")) || null, kind, questions: parseQuestions(str(formData.get("questions"))) });
    revalidatePath("/dashboard/surveys");
  });
}

export async function createFromTemplate(kind: "pulse" | "engagement" | "wellbeing", _prev: FormResult, _fd: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireHrCtx();
    const t = TEMPLATES[kind];
    if (!t) throw new Error("Unknown template.");
    await insertSurvey(c, { title: t.title, description: t.description, kind, questions: parseQuestions(t.questions.join("\n")) });
    revalidatePath("/dashboard/surveys");
  });
}

export async function setSurveyStatus(id: string, status: "Open" | "Closed", _prev: FormResult, _fd: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireHrCtx();
    const { data: s } = await c.supabase.from("surveys").select("id, title, status").eq("id", id).eq("org_id", c.orgId).maybeSingle();
    if (!s) throw new Error("Survey not found.");
    if (status === "Open" && s.status !== "Draft") throw new Error("Only a draft can be opened.");
    if (status === "Closed" && s.status !== "Open") throw new Error("Only an open survey can be closed.");
    const { error } = await c.supabase.from("surveys").update({ status, closed_at: status === "Closed" ? new Date().toISOString() : null }).eq("id", id);
    if (error) throw new Error(error.message);
    if (status === "Open") {
      const db = createAdminClient() as Db;
      await notify(db, { orgId: c.orgId, userIds: (await userIdsWhere(db, c.orgId)).filter((u) => u !== c.userId), type: "SURVEY_OPENED", title: `New survey: ${s.title}`, message: "It is anonymous and takes a few minutes.", entityType: "survey", entityId: id, actionUrl: `/dashboard/me/surveys/${id}` });
    }
    revalidatePath("/dashboard/surveys");
    revalidatePath(`/dashboard/surveys/${id}`);
  });
}

export async function deleteDraftSurvey(id: string, _prev: FormResult, _fd: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireHrCtx();
    const { error } = await c.supabase.from("surveys").delete().eq("id", id).eq("org_id", c.orgId).eq("status", "Draft");
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard/surveys");
  });
}

// The answer rows carry no employee and no time; only the participation row says
// that this person has answered, which is what stops a second submission.
export async function submitSurvey(surveyId: string, _prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireEmployeeCtx();
    const db = createAdminClient() as Db;
    const { data: s } = await db.from("surveys").select("id, status").eq("id", surveyId).eq("org_id", c.orgId).maybeSingle();
    if (!s || s.status !== "Open") throw new Error("This survey is not open.");
    const { data: qs } = await db.from("survey_questions").select("id, qtype").eq("survey_id", surveyId);
    const rows: { survey_id: string; question_id: string; response_key: string; scale_value: number | null; text_value: string | null }[] = [];
    const responseKey = crypto.randomUUID();
    for (const q of qs ?? []) {
      const raw = str(formData.get(`q_${q.id}`));
      if (q.qtype === "scale") {
        const v = Number(raw);
        if (!Number.isInteger(v) || v < 1 || v > 5) throw new Error("Please answer every rating question.");
        rows.push({ survey_id: surveyId, question_id: q.id as string, response_key: responseKey, scale_value: v, text_value: null });
      } else if (raw) {
        rows.push({ survey_id: surveyId, question_id: q.id as string, response_key: responseKey, scale_value: null, text_value: raw.slice(0, 1000) });
      }
    }
    const { error: pe } = await db.from("survey_participation").insert({ survey_id: surveyId, employee_id: c.employeeId });
    if (pe) throw new Error(pe.code === "23505" ? "You have already answered this survey." : pe.message);
    const { error } = await db.from("survey_answers").insert(rows);
    if (error) {
      await db.from("survey_participation").delete().eq("survey_id", surveyId).eq("employee_id", c.employeeId);
      throw new Error("Your answers could not be saved. Please try again.");
    }
    revalidatePath("/dashboard/me/surveys");
  });
}
