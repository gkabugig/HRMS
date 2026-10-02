"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { sendMessage } from "./gateway";
import { confirmActionRequest } from "./confirm-action";
import { validateAttachment, extractAttachmentText } from "./attachments";

export async function startConversation(title?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, employee_id").eq("id", user.id).maybeSingle();
  if (!appUser) throw new Error("No org context.");

  const { data: assistant } = await supabase.from("ai_assistants").select("id").eq("org_id", appUser.org_id).eq("is_active", true).limit(1).maybeSingle();
  if (!assistant) throw new Error("No active assistant configured for this organisation.");

  const { data, error } = await supabase
    .from("ai_conversations")
    .insert({
      org_id: appUser.org_id,
      assistant_id: assistant.id,
      user_id: user.id,
      employee_id: appUser.employee_id ?? null,
      title: title ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/assistant");
  return data.id as string;
}

export async function postMessage(conversationId: string, text: string) {
  const supabase = await createClient();
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Message is empty.");
  const result = await sendMessage(supabase, conversationId, trimmed);
  revalidatePath("/dashboard/assistant");
  return result;
}

export async function uploadConversationAttachment(conversationId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id").eq("id", user.id).maybeSingle();
  if (!appUser) throw new Error("No org context.");

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Choose a file to attach.");

  const validation = validateAttachment(file);
  if (!validation.ok) throw new Error(validation.error);

  const text = await extractAttachmentText(file);

  const { error } = await supabase.from("ai_conversation_attachments").insert({
    org_id: appUser.org_id,
    conversation_id: conversationId,
    uploaded_by: user.id,
    file_name: file.name,
    char_count: text.length,
    content_text: text,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/assistant");
}

export async function removeConversationAttachment(attachmentId: string, conversationId: string) {
  const supabase = await createClient();
  // conversation_id in the filter is defense-in-depth alongside RLS, not a
  // substitute for it - same belt-and-braces pattern as the rest of this file.
  const { error } = await supabase.from("ai_conversation_attachments").delete().eq("id", attachmentId).eq("conversation_id", conversationId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/assistant");
}

export async function decideAction(actionRequestId: string, decision: "confirmed" | "rejected") {
  const supabase = await createClient();
  const result = await confirmActionRequest(supabase, actionRequestId, decision);
  revalidatePath("/dashboard/assistant");
  return result;
}

export async function submitFeedback(conversationId: string, messageId: string, rating: "up" | "down", comment?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id").eq("id", user.id).maybeSingle();
  if (!appUser) throw new Error("No org context.");
  await supabase.from("ai_assistant_feedback").insert({
    org_id: appUser.org_id,
    conversation_id: conversationId,
    message_id: messageId,
    user_id: user.id,
    rating,
    comment: comment ?? null,
  });
  revalidatePath("/dashboard/assistant");
}
