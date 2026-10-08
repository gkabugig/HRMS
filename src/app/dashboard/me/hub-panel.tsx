import Link from "next/link";
import { Chip, Panel, fmtDate, fmtDateTime } from "@/components/ui/page-kit";
import { weekStartOf } from "@/lib/hub/week";
import type { Db } from "@/lib/hub/context";

// Noticeboard, upcoming meetings, open surveys and the weekly wellbeing nudge, on the employee's home.
export default async function HubPanel({ supabase, orgId, employeeId }: { supabase: Db; orgId: string; employeeId: string }) {
  const nowIso = new Date().toISOString();
  const week = weekStartOf(new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" }));
  const [{ data: notices }, { data: events }, { data: surveys }, { data: done }, { data: checkin }, { data: openTasks }] = await Promise.all([
    supabase.from("announcements").select("id, title, pinned, publish_at").eq("org_id", orgId).lte("publish_at", nowIso).or(`expires_at.is.null,expires_at.gt.${nowIso}`).order("pinned", { ascending: false }).order("publish_at", { ascending: false }).limit(3),
    supabase.from("org_events").select("id, kind, title, starts_at, join_url").eq("org_id", orgId).gte("starts_at", nowIso).order("starts_at").limit(3),
    supabase.from("surveys").select("id").eq("org_id", orgId).eq("status", "Open"),
    supabase.from("survey_participation").select("survey_id").eq("employee_id", employeeId),
    supabase.from("wellbeing_checkins").select("id").eq("employee_id", employeeId).eq("week_start", week).maybeSingle(),
    supabase.from("checklist_items").select("id").eq("employee_id", employeeId).is("done_at", null),
  ]);
  const answered = new Set((done ?? []).map((d) => d.survey_id as string));
  const todo = (surveys ?? []).filter((s) => !answered.has(s.id as string)).length;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Panel title="Noticeboard" right={<Link href="/dashboard/announcements" className="text-xs text-brand-600">All →</Link>}>
        {(notices ?? []).length === 0 ? <p className="text-sm text-neutral-400 py-4 text-center">No notices.</p> : (
          <ul className="space-y-2">{(notices ?? []).map((n) => (
            <li key={n.id as string} className="text-sm flex items-center justify-between gap-2"><span>{n.title as string}</span><span className="text-xs text-neutral-500">{n.pinned ? <Chip tone="amber">Pinned</Chip> : fmtDate(n.publish_at as string)}</span></li>
          ))}</ul>
        )}
      </Panel>
      <Panel title="Coming up" right={<Link href="/dashboard/announcements" className="text-xs text-brand-600">Calendar →</Link>}>
        {(events ?? []).length === 0 ? <p className="text-sm text-neutral-400 py-4 text-center">No meetings or events scheduled.</p> : (
          <ul className="space-y-2">{(events ?? []).map((e) => (
            <li key={e.id as string} className="text-sm flex items-center justify-between gap-2">
              <span>{e.title as string} <span className="text-xs text-neutral-500">· {fmtDateTime(e.starts_at as string)}</span></span>
              {e.join_url ? <a href={e.join_url as string} target="_blank" rel="noreferrer" className="text-xs text-brand-600">Join</a> : <Chip>{e.kind as string}</Chip>}
            </li>
          ))}</ul>
        )}
      </Panel>
      <Panel title="For you">
        <ul className="space-y-2 text-sm">
          <li className="flex justify-between"><Link href="/dashboard/me/tasks" className="hover:text-brand-600">My checklist</Link><span className="text-xs text-neutral-500">{(openTasks ?? []).length} open</span></li>
          <li className="flex justify-between"><Link href="/dashboard/me/surveys" className="hover:text-brand-600">Surveys</Link><span className="text-xs text-neutral-500">{todo ? `${todo} to answer` : "All answered"}</span></li>
          <li className="flex justify-between"><Link href="/dashboard/me/wellbeing" className="hover:text-brand-600">Weekly wellbeing check-in</Link><span className="text-xs text-neutral-500">{checkin ? "Done this week" : "Not done yet"}</span></li>
        </ul>
      </Panel>
    </div>
  );
}
