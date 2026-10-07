"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import type { FormResult } from "@/lib/actions/form-result";

// A <form> wired to a server action that returns { error | success }.
// Shows the message under the form and, after a successful save, clears the
// fields (unless resetOnSuccess is false, e.g. for edit forms).
export default function ActionForm({
  action,
  className,
  children,
  successMessage = "Saved.",
  resetOnSuccess = true,
  onSuccess,
}: {
  action: (prev: FormResult, formData: FormData) => Promise<FormResult>;
  className?: string;
  children: ReactNode;
  successMessage?: string | null;
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormResult);
  const [key, setKey] = useState(0);
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.success && resetOnSuccess) setKey((k) => k + 1);
  }

  useEffect(() => {
    if (state.success) onSuccess?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form key={key} action={formAction} className={className} aria-busy={pending}>
      {children}
      {pending && <p className="text-xs text-neutral-400 dark:text-neutral-500 col-span-full">Working…</p>}
      {!pending && state.error && (
        <p role="alert" className="text-xs text-red-600 col-span-full">
          {state.error}
        </p>
      )}
      {!pending && state.success && successMessage && (
        <p role="status" className="text-xs text-green-600 col-span-full">
          {successMessage}
        </p>
      )}
    </form>
  );
}
