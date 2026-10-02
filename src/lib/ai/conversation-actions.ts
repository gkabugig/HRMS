"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { sendMessage, type SendMessageResult } from "./gateway";
import { confirmActionRequest } from "./confirm-action";
import { validateAttachment, extractAttachmentText } from "./attachments";

// Next.js redacts a thrown Error's message to a generic
// "Minified React error #<n>" placeholder once it crosses the Server
// Action boundary in a production build (by design - see
// node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md,
// "Handling expected errors": thrown errors are for bugs caught by an
// error.tsx boundary; anything the UI should actually show the user needs
// to come back as a normal return value instead). Every action below that
// the chat UI surfaces to the user follows that return-value pattern - the
// real message reaches the person instead of a useless digest.
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function safe<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

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

export async function postMessage(conversationId: string, text: string): Promise<ActionResult<SendMessageResult>> {
  return safe(async () => {
    const supabase = await createClient();
    const trimmed = text.trim();
    if (!trimmed) throw new Error("Message is empty.");
    const result = await sendMessage(supabase, conversationId, trimmed);
    revalidatePath("/dashboard/assistant");
    return result;
  });
}

export async function uploadConversationAttachment(conversationId: string, formData: FormData): Promise<ActionResult<void>> {
  return safe(async () => {
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
  });
}

export async function removeConversationAttachment(attachmentId: string, conversationId: string): Promise<ActionResult<void>> {
  return safe(async () => {
    const supabase = await createClient();
    // conversation_id in the filter is defense-in-depth alongside RLS, not
    // a substitute for it - same belt-and-braces pattern as the rest of
    // this file.
    const { error } = await supabase.from("ai_conversation_attachments").delete().eq("id", attachmentId).eq("conversation_id", conversationId);
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard/assistant");
  });
}

// Wipes the messages (and any attachments) in the current conversation but
// keeps the conversation row itself - the chat starts empty again without
// changing which conversation is "active". ai_action_requests rows are left
// alone: the owner-level RLS policy only grants them insert/select on that
// table (update/delete is hr/admin-only, for audit integrity), so a pending
// request can't be deleted here - it stays resolvable via confirm/reject.
export async function clearConversation(conversationId: string): Promise<ActionResult<void>> {
  return safe(async () => {
    const supabase = await createClient();
    const { error: messagesError } = await supabase.from("ai_messages").delete().eq("conversation_id", conversationId);
    if (messagesError) throw new Error(messagesError.message);
    const { error: attachmentsError } = await supabase.from("ai_conversation_attachments").delete().eq("conversation_id", conversationId);
    if (attachmentsError) throw new Error(attachmentsError.message);
    revalidatePath("/dashboard/assistant");
  });
}

// Ends the current conversation (status: closed) without deleting it - it
// stays in history for the user and for hr/admin audit read access. The
// assistant page always loads the most recent *active* conversation and
// creates a new one if none exists, so closing this one is enough to make
// the next page load start a brand new chat.
export async function startNewConversation(conversationId: string): Promise<ActionResult<void>> {
  return safe(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("ai_conversations").update({ status: "closed" }).eq("id", conversationId);
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard/assistant");
  });
}

export async function decideAction(actionRequestId: string, decision: "confirmed" | "rejected"): Promise<ActionResult<Awaited<ReturnType<typeof confirmActionRequest>>>> {
  return safe(async () => {
    const supabase = await createClient();
    const result = await confirmActionRequest(supabase, actionRequestId, decision);
    revalidatePath("/dashboard/assistant");
    return result;
  });
}

export async function submitFeedback(conversationId: string, messageId: string, rating: "up" | "down", comment?: string): Promise<ActionResult<void>> {
  return safe(async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in.");
    const { data: appUser } = await supabase.from("app_users").select("org_id").eq("id", user.id).maybeSingle();
    if (!appUser) throw new Error("No org context.");
    const { error } = await supabase.from("ai_assistant_feedback").insert({
      org_id: appUser.org_id,
      conversation_id: conversationId,
      message_id: messageId,
      user_id: user.id,
      rating,
      comment: comment ?? null,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard/assistant");
  });
}
