// Area 12: AI HR Assistant chat surface (spec §9.1-9.2). Every role sees
// this page — what it can answer or do narrows at the tool-permission
// layer (ai_tool_permissions), not here.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { startConversation } from "@/lib/ai/conversation-actions";
import ChatClient from "./chat-client";

export default async function AssistantPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser) return null;

  let { data: conversation } = await supabase
    .from("ai_conversations")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conversation) {
    const id = await startConversation();
    conversation = { id };
  }

  const [{ data: messages }, { data: pendingActions }] = await Promise.all([
    supabase
      .from("ai_messages")
      .select("id, role, content, created_at, safety_metadata")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("ai_action_requests")
      .select("id, tool_name, arguments, status")
      .eq("conversation_id", conversation.id)
      .eq("status", "pending"),
  ]);

  const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">AI Assistant</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Answers only from your own permitted data and indexed policy — never invents a record, figure or policy. Any action it proposes needs your confirmation.
          </p>
        </div>
        {["admin", "hr"].includes(appUser.role) && (
          <Link href="/dashboard/assistant/knowledge" className="text-sm border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-2 hover:bg-neutral-50 hover:dark:bg-neutral-900 transition-colors">
            Manage policy knowledge
          </Link>
        )}
      </div>

      {!hasApiKey && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-900">
          No AI provider is configured for this deployment yet (missing <code>ANTHROPIC_API_KEY</code>). The chat below will tell you this directly when you send a message — the
          permissions, tool registry, confirmation flow and policy search underneath are fully built and will work the moment a key is added in Vercel&apos;s project environment
          variables.
        </div>
      )}

      <ChatClient
        conversationId={conversation.id}
        initialMessages={messages ?? []}
        pendingActions={(pendingActions ?? []) as { id: string; tool_name: string; arguments: Record<string, unknown>; status: string }[]}
      />
    </div>
  );
}
