"use server";

import { revalidatePath } from "next/cache";
import { toResult, type FormResult } from "@/lib/actions/form-result";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireHrCtx, str, notify, userIdsWhere, type Db } from "./context";

export async function postAnnouncement(_prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireHrCtx();
    const title = str(formData.get("title"));
    const body = str(formData.get("body"));
    const audience = str(formData.get("audience")) === "managers" ? "managers" : "all";
    const expires = str(formData.get("expires_at"));
    if (!title) throw new Error("Give the announcement a title.");
    if (body.length < 5) throw new Error("Write the announcement text.");
    if (expires && Number.isNaN(Date.parse(expires))) throw new Error("The expiry date is not valid.");
    const { data: row, error } = await c.supabase
      .from("announcements")
      .insert({ org_id: c.orgId, title, body, audience, pinned: formData.get("pinned") === "on", expires_at: expires ? new Date(expires).toISOString() : null, created_by: c.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const db = createAdminClient() as Db;
    const ids = await userIdsWhere(db, c.orgId, audience === "managers" ? ["admin", "hr", "manager"] : undefined);
    await notify(db, { orgId: c.orgId, userIds: ids.filter((id) => id !== c.userId), type: "ANNOUNCEMENT", title: `Notice: ${title}`, message: body.slice(0, 140), entityType: "announcement", entityId: row.id as string, actionUrl: "/dashboard/announcements" });
    revalidatePath("/dashboard/announcements");
  });
}

export async function deleteAnnouncement(id: string, _prev: FormResult, _fd: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireHrCtx();
    const { error } = await c.supabase.from("announcements").delete().eq("id", id).eq("org_id", c.orgId);
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard/announcements");
  });
}

export async function addEvent(_prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireHrCtx();
    const title = str(formData.get("title"));
    const starts = str(formData.get("starts_at"));
    const ends = str(formData.get("ends_at"));
    const kind = str(formData.get("kind")) === "meeting" ? "meeting" : "event";
    if (!title) throw new Error("Give the event a title.");
    if (!starts || Number.isNaN(Date.parse(starts))) throw new Error("Choose when it starts.");
    if (ends && (Number.isNaN(Date.parse(ends)) || Date.parse(ends) < Date.parse(starts))) throw new Error("The end time must be after the start.");
    for (const f of ["join_url", "recording_url"]) {
      const v = str(formData.get(f));
      if (v && !/^https?:\/\//i.test(v)) throw new Error("Links must start with http:// or https://");
    }
    const { data: row, error } = await c.supabase
      .from("org_events")
      .insert({
        org_id: c.orgId,
        kind,
        title,
        description: str(formData.get("description")) || null,
        starts_at: new Date(starts).toISOString(),
        ends_at: ends ? new Date(ends).toISOString() : null,
        location: str(formData.get("location")) || null,
        join_url: str(formData.get("join_url")) || null,
        recording_url: str(formData.get("recording_url")) || null,
        organiser: str(formData.get("organiser")) || null,
        created_by: c.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const db = createAdminClient() as Db;
    await notify(db, { orgId: c.orgId, userIds: (await userIdsWhere(db, c.orgId)).filter((id) => id !== c.userId), type: "ORG_EVENT", title: kind === "meeting" ? `Meeting: ${title}` : `Event: ${title}`, message: `Starts ${new Date(starts).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}`, entityType: "org_event", entityId: row.id as string, actionUrl: "/dashboard/announcements" });
    revalidatePath("/dashboard/announcements");
  });
}

// HR adds the recording afterwards.
export async function setRecording(id: string, _prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireHrCtx();
    const url = str(formData.get("recording_url"));
    if (url && !/^https?:\/\//i.test(url)) throw new Error("The link must start with http:// or https://");
    const { error } = await c.supabase.from("org_events").update({ recording_url: url || null }).eq("id", id).eq("org_id", c.orgId);
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard/announcements");
  });
}

export async function deleteEvent(id: string, _prev: FormResult, _fd: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireHrCtx();
    const { error } = await c.supabase.from("org_events").delete().eq("id", id).eq("org_id", c.orgId);
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard/announcements");
  });
}
