// The create-request form lives inline on the service-requests list page
// (no separate /new route exists there) — alias straight to it rather than
// building a redundant second form.
import { redirect } from "next/navigation";

export default function NewRequestRedirect() {
  redirect("/dashboard/service-requests");
}
