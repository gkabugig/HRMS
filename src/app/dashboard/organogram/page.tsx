import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createOrgUnit, deleteOrgUnit, createLocation, createCostCentre, createPosition, assignEmployeePosition } from "@/lib/org-structure/actions";

type Employee = {
  id: string;
  name: string;
  job_title: string;
  department: string;
  reporting_manager_id: string | null;
};

type EmployeeNode = Employee & { children: EmployeeNode[] };

function buildForest(employees: Employee[]): EmployeeNode[] {
  const byId = new Map<string, EmployeeNode>(employees.map((e) => [e.id, { ...e, children: [] }]));
  const roots: EmployeeNode[] = [];

  for (const emp of byId.values()) {
    const managerId = emp.reporting_manager_id;
    if (managerId && byId.has(managerId)) {
      byId.get(managerId)!.children.push(emp);
    } else {
      roots.push(emp);
    }
  }
  return roots;
}

export default async function OrganogramPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const view = params.view === "structure" ? "structure" : "tree";
  const supabase = await createClient();
  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, job_title, department, reporting_manager_id")
    .eq("status", "Active")
    .order("name");

  const forest = buildForest(employees ?? []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Organogram</h1>
          <p className="text-sm text-neutral-500">
            {view === "tree"
              ? "Built from each employee's reporting manager — set or change that on the Employees page to reshape the chart."
              : "Departments, locations, cost centres and positions — a formal structure layer alongside the reporting-line chart."}
          </p>
        </div>
        <div className="flex gap-1 bg-neutral-100 rounded-lg p-1 text-sm">
          <Link
            href="/dashboard/organogram?view=tree"
            className={`px-3 py-1.5 rounded-md ${view === "tree" ? "bg-white shadow-sm font-medium text-neutral-900" : "text-neutral-500"}`}
          >
            Reporting tree
          </Link>
          <Link
            href="/dashboard/organogram?view=structure"
            className={`px-3 py-1.5 rounded-md ${view === "structure" ? "bg-white shadow-sm font-medium text-neutral-900" : "text-neutral-500"}`}
          >
            Structure
          </Link>
        </div>
      </div>

      {view === "structure" ? (
        <StructureView supabase={supabase} employees={employees ?? []} />
      ) : (
      <>
      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-6 overflow-x-auto">
        {forest.length === 0 ? (
          <p className="text-sm text-neutral-400">No active employees yet.</p>
        ) : (
          <ul className="org-tree">
            {forest.map((node) => (
              <TreeNode key={node.id} node={node} />
            ))}
          </ul>
        )}
      </div>

      {/* Classic CSS-only org-chart connectors: each <ul> is a row of siblings,
         joined to their parent by a shared top border + a vertical stub per
         <li>. Scoped with a plain style tag since this is one page. */}
      <style>{`
        .org-tree, .org-tree ul {
          display: flex;
          padding-top: 24px;
          position: relative;
          justify-content: center;
        }
        .org-tree { padding-top: 0; }
        .org-tree ul { margin-top: 0; }
        .org-tree li {
          list-style: none;
          position: relative;
          padding: 24px 12px 0 12px;
          text-align: center;
        }
        .org-tree li::before {
          content: "";
          position: absolute;
          top: 0;
          left: 50%;
          width: 1px;
          height: 24px;
          background: var(--border-subtle);
        }
        .org-tree > li::before { display: none; }
        .org-tree li:only-child::before { display: none; }
        .org-tree ul::before {
          content: "";
          position: absolute;
          top: 0;
          left: calc(25%);
          right: calc(25%);
          height: 1px;
          background: var(--border-subtle);
        }
        .org-tree > ul::before { display: none; }
        .org-tree li:only-child > ul::before { display: none; }
      `}</style>
      </>
      )}
    </div>
  );
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function StructureView({
  supabase,
  employees,
}: {
  supabase: SupabaseServerClient;
  employees: Employee[];
}) {
  const [{ data: units }, { data: locations }, { data: costCentres }, { data: positions }] = await Promise.all([
    supabase.from("organisation_units").select("id, name, unit_type, parent_id").order("name"),
    supabase.from("locations").select("id, name, is_remote").order("name"),
    supabase.from("cost_centres").select("id, code, name").order("code"),
    supabase
      .from("positions")
      .select("id, title, status, headcount_approved, organisation_units(name), locations(name)")
      .order("title"),
  ]);

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <section className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-5">
        <h2 className="text-sm font-semibold text-neutral-900 mb-3">Departments / business units</h2>
        <ul className="space-y-1.5 mb-4 text-sm">
          {(units ?? []).map((u) => (
            <li key={u.id} className="flex items-center justify-between border-b border-neutral-100 pb-1.5">
              <span>
                {u.name} <span className="text-xs text-neutral-400">({u.unit_type})</span>
              </span>
              <form action={deleteOrgUnit.bind(null, u.id)}>
                <button className="text-xs text-red-500 hover:underline">Remove</button>
              </form>
            </li>
          ))}
          {(!units || units.length === 0) && <p className="text-sm text-neutral-400">None yet.</p>}
        </ul>
        <form action={createOrgUnit} className="flex flex-wrap gap-2 text-sm">
          <input name="name" placeholder="Name" required className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 flex-1 min-w-[120px]" />
          <select name="unit_type" defaultValue="department" className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 bg-white">
            <option value="business_unit">Business unit</option>
            <option value="department">Department</option>
            <option value="team">Team</option>
          </select>
          <select name="parent_id" className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 bg-white">
            <option value="">No parent</option>
            {(units ?? []).map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <button className="bg-brand-600 text-white rounded-lg px-3 py-1.5 font-medium">Add</button>
        </form>
      </section>

      <section className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-5">
        <h2 className="text-sm font-semibold text-neutral-900 mb-3">Locations</h2>
        <ul className="space-y-1.5 mb-4 text-sm">
          {(locations ?? []).map((l) => (
            <li key={l.id} className="border-b border-neutral-100 pb-1.5">
              {l.name} {l.is_remote && <span className="text-xs text-neutral-400">(remote)</span>}
            </li>
          ))}
          {(!locations || locations.length === 0) && <p className="text-sm text-neutral-400">None yet.</p>}
        </ul>
        <form action={createLocation} className="flex flex-wrap gap-2 text-sm items-center">
          <input name="name" placeholder="Name" required className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 flex-1 min-w-[120px]" />
          <input name="address" placeholder="Address (optional)" className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 flex-1 min-w-[120px]" />
          <label className="flex items-center gap-1 text-xs text-neutral-500">
            <input type="checkbox" name="is_remote" /> Remote
          </label>
          <button className="bg-brand-600 text-white rounded-lg px-3 py-1.5 font-medium">Add</button>
        </form>
      </section>

      <section className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-5">
        <h2 className="text-sm font-semibold text-neutral-900 mb-3">Cost centres</h2>
        <ul className="space-y-1.5 mb-4 text-sm">
          {(costCentres ?? []).map((c) => (
            <li key={c.id} className="border-b border-neutral-100 pb-1.5 font-mono text-xs">
              {c.code} — <span className="font-sans">{c.name}</span>
            </li>
          ))}
          {(!costCentres || costCentres.length === 0) && <p className="text-sm text-neutral-400">None yet.</p>}
        </ul>
        <form action={createCostCentre} className="flex flex-wrap gap-2 text-sm">
          <input name="code" placeholder="Code" required className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 w-24" />
          <input name="name" placeholder="Name" required className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 flex-1 min-w-[120px]" />
          <button className="bg-brand-600 text-white rounded-lg px-3 py-1.5 font-medium">Add</button>
        </form>
      </section>

      <section className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-5">
        <h2 className="text-sm font-semibold text-neutral-900 mb-3">Positions</h2>
        <ul className="space-y-1.5 mb-4 text-sm">
          {(positions ?? []).map((p) => {
            const unit = p.organisation_units as unknown as { name: string } | null;
            const loc = p.locations as unknown as { name: string } | null;
            return (
              <li key={p.id} className="border-b border-neutral-100 pb-1.5 flex items-center justify-between">
                <span>
                  {p.title}{" "}
                  <span className="text-xs text-neutral-400">
                    {[unit?.name, loc?.name].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === "occupied" ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>
                  {p.status}
                </span>
              </li>
            );
          })}
          {(!positions || positions.length === 0) && <p className="text-sm text-neutral-400">None yet.</p>}
        </ul>
        <form action={createPosition} className="flex flex-wrap gap-2 text-sm mb-4">
          <input name="title" placeholder="Title" required className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 flex-1 min-w-[120px]" />
          <select name="organisation_unit_id" className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 bg-white">
            <option value="">No department</option>
            {(units ?? []).map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <select name="location_id" className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 bg-white">
            <option value="">No location</option>
            {(locations ?? []).map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <button className="bg-brand-600 text-white rounded-lg px-3 py-1.5 font-medium">Add</button>
        </form>

        <h3 className="text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-2">Assign employee to position</h3>
        <form action={assignEmployeePosition} className="flex flex-wrap gap-2 text-sm">
          <select name="employee_id" required className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 bg-white flex-1 min-w-[140px]">
            <option value="">Employee…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <select name="position_id" required className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 bg-white flex-1 min-w-[140px]">
            <option value="">Position…</option>
            {(positions ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
          <button className="bg-brand-600 text-white rounded-lg px-3 py-1.5 font-medium">Assign</button>
        </form>
      </section>
    </div>
  );
}

function TreeNode({ node }: { node: EmployeeNode }) {
  return (
    <li>
      <div className="inline-block bg-[var(--surface)] border border-[var(--border-subtle)] rounded-lg shadow-sm shadow-slate-900/[0.03] px-4 py-2 text-left min-w-[160px]">
        <p className="text-sm font-medium text-neutral-900 whitespace-nowrap">{node.name}</p>
        <p className="text-xs text-neutral-500 whitespace-nowrap">{node.job_title}</p>
        <p className="text-[10px] uppercase tracking-wide text-brand-600 mt-0.5">{node.department}</p>
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}
