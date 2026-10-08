import ActionForm from "@/components/forms/action-form";
import { BTN, BTN_DANGER, BTN_GHOST, Chip, Empty, INPUT, LABEL, PageTitle, Panel, fmtDate, fmtDateTime } from "@/components/ui/page-kit";
import { pageCtx } from "@/lib/hub/context";
import { addEvent, deleteAnnouncement, deleteEvent, postAnnouncement, setRecording } from "@/lib/hub/announcement-actions";

type Ann = { id: string; title: string; body: string; audience: string; pinned: boolean; publish_at: string; expires_at: string | null };
type Ev = { id: string; kind: string; title: string; description: string | null; starts_at: string; ends_at: string | null; location: string | null; join_url: string | null; recording_url: string | null; organiser: string | null };

export default async function AnnouncementsPage() {
  const { supabase, orgId, role } = await pageCtx();
  const isHr = role === "admin" || role === "hr";
  const nowIso = new Date().toISOString();
  const [{ data: anns }, { data: evs }] = await Promise.all([
    supabase.from("announcements").select("id, title, body, audience, pinned, publish_at, expires_at").eq("org_id", orgId).order("pinned", { ascending: false }).order("publish_at", { ascending: false }).limit(50),
    supabase.from("org_events").select("id, kind, title, description, starts_at, ends_at, location, join_url, recording_url, organiser").eq("org_id", orgId).order("starts_at", { ascending: false }).limit(100),
  ]);
  const announcements = (anns ?? []) as Ann[];
  const events = (evs ?? []) as Ev[];
  const upcoming = events.filter((e) => (e.ends_at ?? e.starts_at) >= nowIso).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = events.filter((e) => (e.ends_at ?? e.starts_at) < nowIso);
  const recordings = past.filter((e) => e.recording_url);
  const missedNoRecording = past.filter((e) => e.kind === "meeting" && !e.recording_url).slice(0, 5);

  return (
    <div className="space-y-6">
      <PageTitle title="Noticeboard" subtitle="Announcements, events, meetings and recordings." />

      {isHr && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Post an announcement" subtitle="Everyone is notified. Choose managers only for internal notices.">
            <ActionForm action={postAnnouncement} successMessage="Announcement posted." className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className={LABEL}>Title</label><input name="title" required className={INPUT} /></div>
              <div className="col-span-2"><label className={LABEL}>Message</label><textarea name="body" required rows={3} className={INPUT} /></div>
              <div><label className={LABEL}>Who sees it</label><select name="audience" className={INPUT}><option value="all">Everyone</option><option value="managers">Managers and HR only</option></select></div>
              <div><label className={LABEL}>Hide after (optional)</label><input name="expires_at" type="date" className={INPUT} /></div>
              <label className="col-span-2 flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300"><input type="checkbox" name="pinned" /> Pin to the top</label>
              <div className="col-span-2"><button className={BTN}>Post</button></div>
            </ActionForm>
          </Panel>
          <Panel title="Add an event or meeting" subtitle="Add the recording link afterwards so people who missed it can watch.">
            <ActionForm action={addEvent} successMessage="Added." className="grid grid-cols-2 gap-3">
              <div><label className={LABEL}>Type</label><select name="kind" className={INPUT}><option value="event">Event</option><option value="meeting">Meeting</option></select></div>
              <div><label className={LABEL}>Title</label><input name="title" required className={INPUT} /></div>
              <div><label className={LABEL}>Starts</label><input name="starts_at" type="datetime-local" required className={INPUT} /></div>
              <div><label className={LABEL}>Ends (optional)</label><input name="ends_at" type="datetime-local" className={INPUT} /></div>
              <div><label className={LABEL}>Where</label><input name="location" className={INPUT} placeholder="Boardroom, or Online" /></div>
              <div><label className={LABEL}>Organiser</label><input name="organiser" className={INPUT} /></div>
              <div className="col-span-2"><label className={LABEL}>Join link (optional)</label><input name="join_url" className={INPUT} placeholder="https://" /></div>
              <div className="col-span-2"><label className={LABEL}>What it is about</label><textarea name="description" rows={2} className={INPUT} /></div>
              <div className="col-span-2"><button className={BTN}>Add</button></div>
            </ActionForm>
          </Panel>
        </div>
      )}

      <Panel title="Announcements">
        {announcements.length === 0 ? (
          <Empty>No announcements yet.</Empty>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {announcements.map((a) => (
              <li key={a.id} className="py-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                    {a.pinned && <span className="mr-1">📌</span>}
                    {a.title} {a.audience === "managers" && <Chip tone="purple">Managers only</Chip>}
                  </p>
                  <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-1 whitespace-pre-line">{a.body}</p>
                  <p className="text-xs text-neutral-400 mt-1">{fmtDate(a.publish_at)}{a.expires_at ? ` · hidden after ${fmtDate(a.expires_at)}` : ""}</p>
                </div>
                {isHr && (
                  <ActionForm action={deleteAnnouncement.bind(null, a.id)} successMessage={null} resetOnSuccess={false}>
                    <button className={BTN_DANGER}>Remove</button>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Upcoming events and meetings">
        {upcoming.length === 0 ? (
          <Empty>Nothing coming up.</Empty>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {upcoming.map((e) => (
              <li key={e.id} className="py-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{e.title} <Chip tone={e.kind === "meeting" ? "blue" : "green"}>{e.kind === "meeting" ? "Meeting" : "Event"}</Chip></p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{fmtDateTime(e.starts_at)}{e.location ? ` · ${e.location}` : ""}{e.organiser ? ` · ${e.organiser}` : ""}</p>
                  {e.description && <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-1">{e.description}</p>}
                  {e.join_url && <a href={e.join_url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-600 underline">Join</a>}
                </div>
                {isHr && (
                  <ActionForm action={deleteEvent.bind(null, e.id)} successMessage={null} resetOnSuccess={false}>
                    <button className={BTN_DANGER}>Remove</button>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Recording library" subtitle="Past meetings and events with a recording.">
        {recordings.length === 0 ? (
          <Empty>No recordings yet.</Empty>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {recordings.map((e) => (
              <li key={e.id} className="py-2.5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-neutral-900 dark:text-neutral-50">{e.title}</p>
                  <p className="text-xs text-neutral-400">{fmtDate(e.starts_at)}{e.organiser ? ` · ${e.organiser}` : ""}</p>
                </div>
                <a href={e.recording_url!} target="_blank" rel="noopener noreferrer" className={BTN_GHOST}>Watch recording</a>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {isHr && missedNoRecording.length > 0 && (
        <Panel title="Past meetings without a recording" subtitle="Add the link so people who missed them can catch up.">
          <ul className="space-y-3">
            {missedNoRecording.map((e) => (
              <li key={e.id}>
                <p className="text-sm text-neutral-900 dark:text-neutral-50">{e.title} <span className="text-xs text-neutral-400">{fmtDate(e.starts_at)}</span></p>
                <ActionForm action={setRecording.bind(null, e.id)} successMessage="Recording added." className="flex gap-2 mt-1">
                  <input name="recording_url" placeholder="https://" className={INPUT} />
                  <button className={BTN}>Save</button>
                </ActionForm>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
