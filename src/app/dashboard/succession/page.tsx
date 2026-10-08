import ActionForm from "@/components/forms/action-form";
import { BTN, BTN_DANGER, Chip, Empty, INPUT, LABEL, PageTitle, Panel } from "@/components/ui/page-kit";
import { pageCtx } from "@/lib/hub/context";
import { addSuccessionPlan, addSuccessor, removeSuccessionPlan, removeSuccessor } from "@/lib/hub/succession-actions";

const READY: Record<string, string> = { ready_now: "Ready now", one_to_two_years: "1–2 years", three_plus_years: "3+ years" };
const RISK_TONE: Record<string, "red" | "amber" | "green"> = { high: "red", medium: "amber", low: "green" };

type Plan = { id: string; role_title: string; criticality: string; vacancy_risk: string; notes: string | null; incumbent: { name: string } | null; succession_candidates: { id: string; readiness: string; development_notes: string | null; employees: { name: string } | null }[] };

export default async function SuccessionPage() {
  const { supabase, orgId, role } = await pageCtx();
  if (!["admin", "hr"].includes(role)) return <Empty>Succession planning is for HR and administrators.</Empty>;
  const [{ data: plans }, { data: emps }] = await Promise.all([
    supabase.from("succession_plans").select("id, role_title, criticality, vacancy_risk, notes, incumbent:incumbent_id(name), succession_candidates(id, readiness, development_notes, employees(name))").eq("org_id", orgId).order("created_at"),
    supabase.from("employees").select("id, name, job_title").eq("org_id", orgId).eq("status", "Active").order("name"),
  ]);
  const list = (plans ?? []) as unknown as Plan[];
  const people = (emps ?? []) as { id: string; name: string; job_title: string }[];
  const uncovered = list.filter((p) => !p.succession_candidates.some((c) => c.readiness === "ready_now"));
  const exposed = uncovered.filter((p) => p.criticality === "high" || p.vacancy_risk === "high");

  return (
    <div className="space-y-6">
      <PageTitle title="Succession planning" subtitle="Critical roles, who holds them, and who could step in. Visible to HR only." />
      <div className="grid grid-cols-3 gap-4">
        <Panel title="Roles tracked"><p className="text-2xl font-semibold">{list.length}</p></Panel>
        <Panel title="No one ready now"><p className="text-2xl font-semibold">{uncovered.length}</p></Panel>
        <Panel title="High-risk and uncovered"><p className={`text-2xl font-semibold ${exposed.length ? "text-red-600" : ""}`}>{exposed.length}</p></Panel>
      </div>

      {list.length === 0 ? (
        <Panel><Empty>No roles tracked yet. Add the first critical role below.</Empty></Panel>
      ) : (
        list.map((p) => (
          <Panel
            key={p.id}
            title={p.role_title}
            subtitle={`Held by ${p.incumbent?.name ?? "no one recorded"}`}
            right={
              <div className="flex items-center gap-2">
                <Chip tone={RISK_TONE[p.criticality]}>{p.criticality} criticality</Chip>
                <Chip tone={RISK_TONE[p.vacancy_risk]}>{p.vacancy_risk} vacancy risk</Chip>
                <ActionForm action={removeSuccessionPlan.bind(null, p.id)} successMessage={null} resetOnSuccess={false}><button className={BTN_DANGER}>Remove</button></ActionForm>
              </div>
            }
          >
            {p.notes && <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3">{p.notes}</p>}
            {p.succession_candidates.length === 0 ? (
              <p className="text-sm text-red-600">No successor named.</p>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {p.succession_candidates.map((c) => (
                  <li key={c.id} className="py-2 flex items-center justify-between text-sm">
                    <span>{c.employees?.name} <Chip tone={c.readiness === "ready_now" ? "green" : c.readiness === "one_to_two_years" ? "amber" : "neutral"}>{READY[c.readiness]}</Chip>{c.development_notes && <span className="text-xs text-neutral-500"> · {c.development_notes}</span>}</span>
                    <ActionForm action={removeSuccessor.bind(null, c.id)} successMessage={null} resetOnSuccess={false}><button className={BTN_DANGER}>Remove</button></ActionForm>
                  </li>
                ))}
              </ul>
            )}
            <ActionForm action={addSuccessor.bind(null, p.id)} successMessage="Successor added." className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end mt-3">
              <div><label className={LABEL}>Successor</label><select name="employee_id" required className={INPUT}><option value="">Choose…</option>{people.map((e) => <option key={e.id} value={e.id}>{e.name} — {e.job_title}</option>)}</select></div>
              <div><label className={LABEL}>Ready in</label><select name="readiness" className={INPUT}><option value="ready_now">Ready now</option><option value="one_to_two_years">1–2 years</option><option value="three_plus_years">3+ years</option></select></div>
              <div><label className={LABEL}>Development needed</label><input name="development_notes" className={INPUT} /></div>
              <div><button className={BTN}>Add successor</button></div>
            </ActionForm>
          </Panel>
        ))
      )}

      <Panel title="Add a critical role">
        <ActionForm action={addSuccessionPlan} successMessage="Role added." className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
          <div><label className={LABEL}>Role</label><input name="role_title" required className={INPUT} placeholder="Finance Manager" /></div>
          <div><label className={LABEL}>Current holder</label><select name="incumbent_id" className={INPUT}><option value="">Vacant or not recorded</option>{people.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
          <div><label className={LABEL}>How critical is the role</label><select name="criticality" className={INPUT} defaultValue="medium"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div>
          <div><label className={LABEL}>Chance it falls vacant soon</label><select name="vacancy_risk" className={INPUT} defaultValue="low"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div>
          <div className="sm:col-span-2"><label className={LABEL}>Notes</label><input name="notes" className={INPUT} /></div>
          <div><button className={BTN}>Add role</button></div>
        </ActionForm>
      </Panel>
    </div>
  );
}
