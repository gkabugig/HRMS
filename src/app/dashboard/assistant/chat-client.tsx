"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postMessage, decideAction, submitFeedback } from "@/lib/ai/conversation-actions";

type Message = {
  id: string;
  role: string;
  content: string | null;
  created_at: string;
  safety_metadata: Record<string, unknown> | null;
};

type PendingAction = {
  id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  status: string;
};

export default function ChatClient({ conversationId, initialMessages, pendingActions }: { conversationId: string; initialMessages: Message[]; pendingActions: PendingAction[] }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function send() {
    const value = text.trim();
    if (!value) return;
    setText("");
    setError(null);
    startTransition(async () => {
      try {
        await postMessage(conversationId, value);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to send message.");
      }
    });
  }

  function respondToAction(actionId: string, decision: "confirmed" | "rejected") {
    startTransition(async () => {
      try {
        await decideAction(actionId, decision);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to record your decision.");
      }
    });
  }

  function giveFeedback(messageId: string, rating: "up" | "down") {
    startTransition(async () => {
      await submitFeedback(conversationId, messageId, rating);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col h-[70vh] bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {initialMessages.length === 0 && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Ask about your workforce KPIs, risk signals, approval/case status, HR policy, or start a request. Anything that changes a record will ask you to confirm first.</p>
        )}
        {initialMessages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === "user" ? "bg-brand-600 text-white" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-50"
              }`}
            >
              {m.content}
              {m.role === "assistant" && (
                <div className="mt-1 flex gap-2 text-xs text-neutral-400 dark:text-neutral-500">
                  <button onClick={() => giveFeedback(m.id, "up")} className="hover:text-neutral-700 hover:dark:text-neutral-200">
                    👍
                  </button>
                  <button onClick={() => giveFeedback(m.id, "down")} className="hover:text-neutral-700 hover:dark:text-neutral-200">
                    👎
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {pendingActions.map((a) => (
          <div key={a.id} className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">
            <p className="font-medium text-amber-900">Confirmation needed: {a.tool_name.replace(/_/g, " ")}</p>
            <pre className="text-xs text-amber-800 mt-1 whitespace-pre-wrap">{JSON.stringify(a.arguments, null, 2)}</pre>
            <div className="mt-2 flex gap-2">
              <button
                disabled={isPending}
                onClick={() => respondToAction(a.id, "confirmed")}
                className="text-xs bg-amber-600 text-white rounded-lg px-3 py-1.5 hover:bg-amber-700 disabled:opacity-50"
              >
                Confirm
              </button>
              <button
                disabled={isPending}
                onClick={() => respondToAction(a.id, "rejected")}
                className="text-xs border border-amber-300 text-amber-900 rounded-lg px-3 py-1.5 hover:bg-amber-100 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="px-4 text-xs text-red-600">{error}</p>}

      <div className="border-t border-[var(--border-subtle)] p-3 flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask the HR Assistant…"
          rows={1}
          className="flex-1 resize-none text-sm border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <button
          disabled={isPending || !text.trim()}
          onClick={send}
          className="text-sm bg-brand-600 text-white rounded-lg px-4 py-2 hover:bg-brand-700 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
