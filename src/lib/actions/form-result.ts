// Server actions that fail should RETURN a message, not throw. In production
// Next.js hides the text of a thrown error (the person just sees a blank
// crash page), so expected problems - "enter both latitude and longitude",
// "that shift is still assigned" - come back as a result the form can show
// next to the button. Real bugs still throw to the error page.
import { unstable_rethrow } from "next/navigation";

export type FormResult = { error?: string; success?: boolean };

export async function toResult(fn: () => Promise<void>): Promise<FormResult> {
  try {
    await fn();
    return { success: true };
  } catch (e) {
    // Let Next's own control-flow errors (redirect, notFound) through.
    unstable_rethrow(e);
    return { error: e instanceof Error && e.message ? e.message : "Something went wrong. Please try again." };
  }
}
