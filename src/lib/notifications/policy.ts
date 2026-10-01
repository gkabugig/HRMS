import type { SupabaseClient } from "@supabase/supabase-js";
import { getEventDefinition } from "./event-catalogue";
import type { NotificationPriority } from "./notification-types";

export type PolicyRow = {
  eventType: string;
  category: string;
  priority: NotificationPriority;
  mandatory: boolean;
  allowedChannels: string[];
  fallbackChannels: string[];
  dedupeWindowSeconds: number;
  maxPerHour: number | null;
  quietHoursAllowed: boolean;
  escalationAfterMinutes: number | null;
  maxEscalationDepth: number;
};

// Area 09 §7/§12 — resolves the org's configured policy row for an event
// type, falling back to the event catalogue's own default classification
// when no row has been seeded yet (so the system works before an admin
// has visited the policy screen, consistent with "In-app delivery works
// without external providers" / sane-defaults-first spirit of §32).
export async function resolvePolicy(supabase: SupabaseClient, orgId: string, eventType: string): Promise<PolicyRow> {
  const { data } = await supabase
    .from("notification_policy_rules")
    .select(
      "event_type, category, priority, mandatory, allowed_channels, fallback_channels, dedupe_window_seconds, max_per_hour, quiet_hours_allowed, escalation_after_minutes, max_escalation_depth"
    )
    .eq("org_id", orgId)
    .eq("event_type", eventType)
    .eq("is_active", true)
    .maybeSingle();

  if (data) {
    return {
      eventType: data.event_type,
      category: data.category,
      priority: data.priority as NotificationPriority,
      mandatory: data.mandatory,
      allowedChannels: data.allowed_channels ?? ["in_app"],
      fallbackChannels: data.fallback_channels ?? [],
      dedupeWindowSeconds: data.dedupe_window_seconds ?? 300,
      maxPerHour: data.max_per_hour,
      quietHoursAllowed: data.quiet_hours_allowed,
      escalationAfterMinutes: data.escalation_after_minutes,
      maxEscalationDepth: data.max_escalation_depth ?? 2,
    };
  }

  const def = getEventDefinition(eventType);
  return {
    eventType,
    category: def?.category ?? "system",
    priority: def?.defaultPriority ?? "information",
    mandatory: def?.mandatory ?? false,
    allowedChannels: ["in_app"],
    fallbackChannels: [],
    dedupeWindowSeconds: 300,
    maxPerHour: null,
    quietHoursAllowed: false,
    escalationAfterMinutes: null,
    maxEscalationDepth: 2,
  };
}

export type ChannelDecision = {
  channel: string;
  send: boolean;
  scheduledFor: Date;
  reason: string;
  /** Set when this channel's delivery for this (low-priority, non-
   * mandatory) notification should be batched into a digest instead of
   * sent individually — see digest.ts. */
  digestGroup?: string;
};

// §17 "Group low-priority notifications into configurable daily/weekly
// digests." Daily groups by calendar day; weekly groups by ISO week
// (Monday-start), both in the org's default timezone (no per-user
// timezone-accurate week boundary — a pragmatic simplification given
// this product is single-timezone in practice).
export function digestGroupKey(frequency: "daily" | "weekly", date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const mo = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  if (frequency === "daily") return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const local = new Date(Date.UTC(y, mo - 1, d));
  const dayNum = (local.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(local);
  monday.setUTCDate(local.getUTCDate() - dayNum);
  return `W${monday.toISOString().slice(0, 10)}`;
}

// Area 09 §12 Preference & Policy Hierarchy, applied per channel:
//   1. System/security  — critical priority always goes out on every
//      policy-allowed channel immediately, full stop.
//   2/3. Org policy + mandatory classification — policy.mandatory=true
//      means a user's own opt-out (step 5) cannot block it; only an
//      active suppression (step 8, an admin-created window, not a user
//      self-service toggle) or a hard channel outage can.
//   4. Role/context rules — not modeled as a separate table in this
//      build (no case in Areas 01-08 needed a role-conditioned
//      notification rule beyond what recipient resolution already
//      encodes); documented as a scope note rather than silently
//      skipped.
//   5. User channel preference — notification_preferences(category,channel).
//   6. Quiet hours — per-user (or org-default) local time window.
//   7. Rate limit — policy.maxPerHour, counted against this recipient's
//      recent notifications in this category.
//   8. Suppression — notification_suppressions active window.
//   9. Channel availability — handled by the dispatcher (channel adapter
//      reports "not configured"), not here.
export async function resolveChannelPlan(
  supabase: SupabaseClient,
  orgId: string,
  recipientUserId: string,
  policy: PolicyRow
): Promise<ChannelDecision[]> {
  const isCriticalOrMandatory = policy.priority === "critical" || policy.mandatory;

  const [{ data: prefRow }, { data: suppressions }, { data: org }] = await Promise.all([
    supabase
      .from("notification_preferences")
      .select("in_app, email, sms, push, quiet_hours_start, quiet_hours_end, timezone, digest_mode")
      .eq("user_id", recipientUserId)
      .eq("notification_type", policy.category)
      .maybeSingle(),
    supabase
      .from("notification_suppressions")
      .select("user_id, category, channel, starts_at, ends_at")
      .eq("org_id", orgId)
      .lte("starts_at", new Date().toISOString())
      .or("ends_at.is.null,ends_at.gte." + new Date().toISOString()),
    supabase.from("organizations").select("default_timezone").eq("id", orgId).maybeSingle(),
  ]);

  const timezone = prefRow?.timezone || org?.default_timezone || "Africa/Nairobi";
  const now = new Date();
  const inQuietHours = isWithinQuietHours(now, timezone, prefRow?.quiet_hours_start ?? null, prefRow?.quiet_hours_end ?? null);

  const suppressedChannels = new Set(
    (suppressions ?? [])
      .filter((s) => (s.user_id === null || s.user_id === recipientUserId) && (s.category === null || s.category === policy.category))
      .map((s) => s.channel)
      .filter((c): c is string => c !== null)
  );
  const orgWideSuppressed = (suppressions ?? []).some(
    (s) => s.user_id === null && s.category === null && s.channel === null
  );

  let rateLimited = false;
  if (policy.maxPerHour !== null) {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_user_id", recipientUserId)
      .eq("category", policy.category)
      .gte("created_at", hourAgo);
    rateLimited = (count ?? 0) >= policy.maxPerHour && !isCriticalOrMandatory;
  }

  const decisions: ChannelDecision[] = [];
  for (const channel of policy.allowedChannels) {
    if (orgWideSuppressed || suppressedChannels.has(channel)) {
      decisions.push({ channel, send: false, scheduledFor: now, reason: "suppressed" });
      continue;
    }

    const channelEnabled = channel === "in_app" ? prefRow?.in_app ?? true : channel === "email" ? prefRow?.email ?? false : channel === "sms" ? prefRow?.sms ?? false : channel === "push" ? prefRow?.push ?? false : true;
    if (!channelEnabled && !isCriticalOrMandatory) {
      decisions.push({ channel, send: false, scheduledFor: now, reason: "user_opted_out" });
      continue;
    }

    if (rateLimited && channel !== "in_app") {
      decisions.push({ channel, send: false, scheduledFor: now, reason: "rate_limited" });
      continue;
    }

    const digestMode = prefRow?.digest_mode as "instant" | "daily" | "weekly" | undefined;
    if (channel !== "in_app" && digestMode && digestMode !== "instant" && !isCriticalOrMandatory) {
      decisions.push({
        channel,
        send: true,
        scheduledFor: now,
        reason: "digest_queued",
        digestGroup: digestGroupKey(digestMode, now, timezone),
      });
      continue;
    }

    if (inQuietHours && channel !== "in_app" && !policy.quietHoursAllowed && !isCriticalOrMandatory) {
      decisions.push({
        channel,
        send: true,
        scheduledFor: nextQuietHoursEnd(now, timezone, prefRow?.quiet_hours_end ?? null),
        reason: "deferred_quiet_hours",
      });
      continue;
    }

    decisions.push({ channel, send: true, scheduledFor: now, reason: "ok" });
  }

  return decisions;
}

function isWithinQuietHours(now: Date, timezone: string, start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  const local = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  return local >= start.slice(0, 5) && local <= end.slice(0, 5)
    ? start <= end
    : // overnight window (e.g. 21:00–06:00)
      local >= start.slice(0, 5) || local <= end.slice(0, 5);
}

function nextQuietHoursEnd(now: Date, timezone: string, end: string | null): Date {
  if (!end) return now;
  const [h, m] = end.split(":").map(Number);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value;
  const mo = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  const target = new Date(`${y}-${mo}-${d}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  return target;
}
