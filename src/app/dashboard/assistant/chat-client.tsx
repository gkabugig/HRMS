"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, X } from "lucide-react";
import { postMessage, decideAction, submitFeedback, uploadConversationAttachment, removeConversationAttachment } from "@/lib/ai/conversation-actions";

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

type Attachment = {
  id: string;
  file_name: string;
  char_count: number;
  created_at: string;
};

export default function ChatClient({
  conversationId,
  initialMessages,
  pendingActions,
  attachments,
}: {
  conversationId: string;
  initialMessages: Message[];
  pendingActions: PendingAction[];
  attachments: Attachment[];
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isUploading, startUploading] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function handleAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const formData = new FormData();
    formData.set("file", file);
    startUploading(async () => {
      const result = await uploadConversationAttachment(conversationId, formData);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function removeAttachment(attachmentId: string) {
    startUploading(async () => {
      const result = await removeConversationAttachment(attachmentId, conversationId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function send() {
    const value = text.trim();
    if (!value) return;
    setText("");
    setError(null);
    startTransition(async () => {
      const result = await postMessage(conversationId, value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function respondToAction(actionId: string, decision: "confirmed" | "rejected") {
    startTransition(async () => {
      const result = await decideAction(actionId, decision);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function giveFeedback(messageId: string, rating: "up" | "down") {
    startTransition(async () => {
      const result = await submitFeedback(conversationId, messageId, rating);
      if (!result.ok) setError(result.error);
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

      {error && <p className="px-4 text-xs text-red-600 dark:text-red-400">{error}</p>}

      {attachments.length > 0 && (
        <div className="px-3 pt-2 flex flex-wrap gap-1.5 border-t border-[var(--border-subtle)]">
          {attachments.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1.5 text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 rounded-full pl-2.5 pr-1.5 py-1"
              title={`${a.char_count.toLocaleString()} characters`}
            >
              <Paperclip size={11} />
              {a.file_name}
              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                disabled={isUploading}
                aria-label={`Remove ${a.file_name}`}
                className="hover:text-red-600 hover:dark:text-red-400 disabled:opacity-50"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className={`border-[var(--border-subtle)] p-3 flex gap-2 items-end ${attachments.length > 0 ? "" : "border-t"}`}>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          aria-label="Attach a document"
          title="Attach a document (.txt, .md, .csv, .pdf, .docx)"
          className="shrink-0 border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 hover:dark:bg-neutral-900 disabled:opacity-50"
        >
          <Paperclip size={16} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.csv,.pdf,.docx,text/plain,text/markdown,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={handleAttach}
        />
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
