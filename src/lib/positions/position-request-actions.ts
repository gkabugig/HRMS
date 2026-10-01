"use server";

// Area 16 §7.7: position create/change/freeze/unfreeze/close requests,
// routed through Area 02's generic approval engine (createApprovalRequest,
// the same hand-built-steps pattern used by attendance_correction and
// document_issue — no new approval_definitions row needed) rather than a
// bespoke position-approval flow. Single HR/admin approval step: position
// changes affect headcount and budget, which is HR's call org-wide, not a
// line manager's. The domain effect (actually creating/mutating the
// position) is applied only once decidePositionRequest sees "approved",
// exactly mirroring decideAttendanceCorrectionRequest's "decide, then
// apply" split.
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createApprovalRequest } from "@/lib/approvals/create-approval-request";
import { decideApprovalStep } from "@/lib/approvals/decide-approval-step";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";

const REQUEST_TYPES = ["create", "change", "freeze", "unfreeze", "close"] as const;
type RequestType = (typeof REQUEST_TYPES)[number];

async function requireRequester(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser) throw new Error("No org context.");
  return { userId: user.id, orgId: appUser.org_id as string, role: appUser.role as string };
}

async function nextVersionNo(supabase: Awaited<ReturnType<typeof createClient>>, positionId: string) {
  const { data } = await supabase
    .from("position_versions")
    .select("version_no")
    .eq("position_id", positionId)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.version_no ?? 0) + 1;
}

async function snapshotVersion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  positionId: string,
  orgId: string,
  changedBy: string | null,
  changeReason: string
) {
  const { data: position } = await supabase
    .from("positions")
    .select("title, organisation_unit_id, location_id, cost_centre_id, reports_to_position_id, position_type_id, approved_headcount, lifecycle_status, effective_from, effective_to")
    .eq("id", positionId)
    .single();
  if (!position) return;
  const versionNo = await nextVersionNo(supabase, positionId);
  await supabase.from("position_versions").insert({
    position_id: positionId,
    org_id: orgId,
    version_no: versionNo,
    title: position.title,
    organisation_unit_id: position.organisation_unit_id,
    location_id: position.location_id,
    cost_centre_id: position.cost_centre_id,
    reports_to_position_id: position.reports_to_position_id,
    position_type_id: position.position_type_id,
    approved_headcount: position.approved_headcount,
    lifecycle_status: position.lifecycle_status,
    effective_from: position.effective_from ?? new Date().toISOString().slice(0, 10),
    effective_to: position.effective_to,
    changed_by: changedBy,
    change_reason: changeReason,
  });
}

async function logEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  positionId: string,
  orgId: string,
  eventType: string,
  actorUserId: string | null,
  details: Record<string, unknown>
) {
  await supabase.from("position_events").insert({
    position_id: positionId,
    org_id: orgId,
    event_type: eventType,
    actor_user_id: actorUserId,
    details,
  });
}

export async function submitPositionRequest(formData: FormData) {
  const supabase = await createClient();
  const { userId, orgId } = await requireRequester(supabase);

  const requestType = String(formData.get("request_type") || "") as RequestType;
  if (!REQUEST_TYPES.includes(requestType)) throw new Error("Invalid request type.");
  const justification = String(formData.get("justification") || "").trim();
  if (!justification) throw new Error("A justification is required.");

  const positionId = String(formData.get("position_id") || "") || null;
  let summary = "";
  const payload: Record<string, unknown> = { justification };

  if (requestType === "create") {
    const title = String(formData.get("title") || "").trim();
    if (!title) throw new Error("Title is required.");
    payload.title = title;
    payload.organisation_unit_id = String(formData.get("organisation_unit_id") || "") || null;
    payload.location_id = String(formData.get("location_id") || "") || null;
    payload.cost_centre_id = String(formData.get("cost_centre_id") || "") || null;
    payload.reports_to_position_id = String(formData.get("reports_to_position_id") || "") || null;
    payload.position_type_id = String(formData.get("position_type_id") || "") || null;
    payload.position_code = String(formData.get("position_code") || "") || null;
    payload.approved_headcount = Number(formData.get("approved_headcount") || 1);
    summary = `New position request: ${title}`;
  } else {
    if (!positionId) throw new Error("Select a position.");
    const { data: position } = await supabase.from("positions").select("title").eq("id", positionId).eq("org_id", orgId).maybeSingle();
    if (!position) throw new Error("Position not found.");
    if (requestType === "change") {
      for (const field of ["title", "organisation_unit_id", "location_id", "cost_centre_id", "reports_to_position_id", "position_type_id", "approved_headcount"]) {
        const value = formData.get(field);
        if (value !== null && String(value) !== "") payload[field] = field === "approved_headcount" ? Number(value) : String(value);
      }
      summary = `Change request for position: ${position.title}`;
    } else {
      summary = `${requestType[0].toUpperCase()}${requestType.slice(1)} request for position: ${position.title}`;
    }
  }

  const { data: requestRow, error } = await supabase
    .from("position_requests")
    .insert({
      org_id: orgId,
      position_id: positionId,
      request_type: requestType,
      requested_by: userId,
      status: "submitted",
      payload_json: payload,
      justification,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const approvalRequestId = await createApprovalRequest(supabase, {
    orgId,
    requestType: `position_${requestType}`,
    entityType: "position_request",
    entityId: requestRow.id,
    requestedBy: userId,
    summary,
    impact: payload,
    steps: [{ approverRole: "hr" }],
  });

  await supabase.from("position_requests").update({ approval_request_id: approvalRequestId }).eq("id", requestRow.id);

  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: `position_request.${requestType}.submitted`,
    resourceType: "position_request",
    resourceId: requestRow.id,
    eventCategory: "workflow",
  });

  revalidatePath("/dashboard/positions/requests");
  revalidatePath("/dashboard/approvals");
}

// Dispatched from the universal approvals inbox for request_type matching
// 'position_create'/'position_change'/'position_freeze'/'position_unfreeze'/
// 'position_close' — see decideApproval's dispatch table.
export async function decidePositionRequest(stepId: string, decision: "approved" | "rejected") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser) throw new Error("No org context.");

  const { data: stepRow } = await supabase
    .from("approval_steps")
    .select("approval_requests(entity_id, request_type)")
    .eq("id", stepId)
    .maybeSingle();
  const approvalRequestRow = stepRow?.approval_requests as unknown as { entity_id: string | null; request_type: string } | null;
  const positionRequestId = approvalRequestRow?.entity_id ?? null;
  if (!positionRequestId) throw new Error("Position request not found.");

  const { requestId } = await decideApprovalStep(supabase, { stepId, orgId: appUser.org_id, decision });

  const { data: positionRequest } = await supabase
    .from("position_requests")
    .select("id, org_id, position_id, request_type, payload_json")
    .eq("id", positionRequestId)
    .single();
  if (!positionRequest) throw new Error("Position request not found.");

  const requestType = positionRequest.request_type as RequestType;
  const payload = (positionRequest.payload_json ?? {}) as Record<string, unknown>;
  let effectivePositionId = positionRequest.position_id;

  if (decision === "approved") {
    if (requestType === "create") {
      const { data: created, error } = await supabase
        .from("positions")
        .insert({
          org_id: positionRequest.org_id,
          title: payload.title,
          organisation_unit_id: payload.organisation_unit_id ?? null,
          location_id: payload.location_id ?? null,
          cost_centre_id: payload.cost_centre_id ?? null,
          reports_to_position_id: payload.reports_to_position_id ?? null,
          position_type_id: payload.position_type_id ?? null,
          position_code: payload.position_code ?? null,
          approved_headcount: payload.approved_headcount ?? 1,
          status: "vacant",
          is_active: true,
          lifecycle_status: "approved",
          effective_from: new Date().toISOString().slice(0, 10),
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      effectivePositionId = created.id;
      await snapshotVersion(supabase, created.id, positionRequest.org_id, user.id, "Created via approved position request");
      await logEvent(supabase, created.id, positionRequest.org_id, "created", user.id, { positionRequestId });
    } else if (effectivePositionId) {
      if (requestType === "change") {
        const update: Record<string, unknown> = {};
        for (const field of ["title", "organisation_unit_id", "location_id", "cost_centre_id", "reports_to_position_id", "position_type_id", "approved_headcount"]) {
          if (field in payload) update[field] = payload[field];
        }
        await supabase.from("positions").update(update).eq("id", effectivePositionId);
        await snapshotVersion(supabase, effectivePositionId, positionRequest.org_id, user.id, "Changed via approved position request");
        await logEvent(supabase, effectivePositionId, positionRequest.org_id, "changed", user.id, { positionRequestId, update });
      } else if (requestType === "freeze") {
        await supabase.from("positions").update({ lifecycle_status: "frozen" }).eq("id", effectivePositionId);
        await logEvent(supabase, effectivePositionId, positionRequest.org_id, "frozen", user.id, { positionRequestId });
      } else if (requestType === "unfreeze") {
        await supabase.from("positions").update({ lifecycle_status: "active" }).eq("id", effectivePositionId);
        await logEvent(supabase, effectivePositionId, positionRequest.org_id, "unfrozen", user.id, { positionRequestId });
      } else if (requestType === "close") {
        await supabase.from("positions").update({ lifecycle_status: "closed", is_active: false }).eq("id", effectivePositionId);
        await logEvent(supabase, effectivePositionId, positionRequest.org_id, "closed", user.id, { positionRequestId });
      }
    }
  }

  await supabase
    .from("position_requests")
    .update({ status: decision === "approved" ? "approved" : "rejected", decided_at: new Date().toISOString(), position_id: effectivePositionId })
    .eq("id", positionRequestId);

  await recordAuditEvent(supabase, {
    orgId: positionRequest.org_id,
    actorUserId: user.id,
    actorRole: appUser.role,
    action: `position_request.${requestType}.${decision}`,
    resourceType: "position_request",
    resourceId: positionRequestId,
    eventCategory: "approval",
    after: { decision },
  });

  revalidatePath("/dashboard/approvals");
  revalidatePath("/dashboard/positions");
  revalidatePath("/dashboard/positions/requests");

  return { requestId };
}

// Admin/HR activate an "approved" position so it becomes live/postable —
// deliberately NOT routed through another approval (the headcount/budget
// decision already happened at the create-request step); this is purely
// "make it effective now" per spec §7.3's approved->active transition.
export async function activatePosition(positionId: string) {
  const supabase = await createClient();
  const { userId, orgId, role } = await requireRequester(supabase);
  if (!["admin", "hr"].includes(role)) throw new Error("Only admin/HR can activate a position.");

  const { error } = await supabase
    .from("positions")
    .update({ lifecycle_status: "active" })
    .eq("id", positionId)
    .eq("org_id", orgId)
    .eq("lifecycle_status", "approved");
  if (error) throw new Error(error.message);

  await logEvent(supabase, positionId, orgId, "activated", userId, {});
  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    actorRole: role,
    action: "position.activated",
    resourceType: "position",
    resourceId: positionId,
    eventCategory: "workflow",
  });

  revalidatePath("/dashboard/positions");
}
