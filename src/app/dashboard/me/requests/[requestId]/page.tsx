// Request detail/timeline already exists at /dashboard/service-requests/[id]
// (thread, status, assigned queue, messages, attachments — spec §10's
// "Request detail" row verbatim) — alias to it rather than rebuilding it.
import { redirect } from "next/navigation";

export default async function RequestDetailRedirect({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  redirect(`/dashboard/service-requests/${requestId}`);
}
