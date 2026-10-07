import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  createOrgUnit,
  deleteOrgUnit,
  createLocation,
  createCostCentre,
  createPosition,
  assignEmployeePosition,
  setPositionActive,
  runOrganisationDataQuality,
} from "@/lib/org-structure/actions";
import OrgChart from "./org-chart";
import { getOrgTree, type OrgTreeNode } from "@/lib/organisation/get-org-tree";

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

const TABS = [
  { key: "chart", label: "Org chart" },
  { key: "hierarchy", label: "Hierarchy" },
  { key: "tree", label: "Reporting tree" },
  { key: "structure", label: "Structure" },
  { key: "vacancies", label: "Vacancies" },
] as const;

export default async function OrganogramPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const view = (TABS.find((t) => t.key === params.view)?.key ?? "chart") as (typeof TABS)[number]["key"];
  const supabase = await createClient();

  const { data: appUser } = await supabase.auth.getUser().then(async ({ data }) => {
    if (!data.user) return { data: null };
    return supabase.from("app_users").select("org_id, role").eq("id", data.user.id).maybeSingle();
  });
  const orgId = appUser?.org_id as string | undefined;
  const isAdminOrHr = appUser?.role === "admin" || appUser?.role === "hr";

  let { data: employees } = (await supabase
    .from("employees")
    .select("id, name, job_title, department, reporting_manager_id, is_head_of_organisation")
    .eq("status", "Active")
    .order("name")) as { data: (Employee & { is_head_of_organisation?: boolean })[] | null };
  if (!employees) {
    // Migration 0136 not applied yet — fall back to the columns that always exist.
    ({ data: employees } = (await supabase
      .from("employees")
      .select("id, name, job_title, department, reporting_manager_id")
      .eq("status", "Active")
      .order("name")) as { data: Employee[] | null });
  }

  const forest = buildForest(employees ?? []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Organogram</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Authoritative organisation hierarchy, positions, locations, cost centres and reporting lines — Employee Data
            Change, approvals and RBAC department scope all now read from this model.
          </p>
        </div>
        <div className="flex gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg p-1 text-sm">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/dashboard/organogram?view=${t.key}`}
              className={`px-3 py-1.5 rounded-md ${view === t.key ? "bg-white dark:bg-neutral-900 shadow-sm font-medium text-neutral-900 dark:text-neutral-50" : "text-neutral-500 dark:text-neutral-400"}`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {isAdminOrHr && <DataQualityPanel supabase={supabase} orgId={orgId} />}

      {view === "chart" && <OrgChart people={employees ?? []} />}

      {view === "hierarchy" && orgId && <HierarchyView supabase={supabase} orgId={orgId} />}

      {view === "tree" && (
        <>
          <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-6 overflow-x-auto">
            <p className="text-xs text-neutral-400 dark:text-neutral-500 mb-4">
              Built from each employee&apos;s current authoritative line manager (reporting_relationships) — kept in sync
              with the legacy reporting-manager field whenever an assignment changes on the Structure tab.
            </p>
            {forest.length === 0 ? (
              <p className="text-sm text-neutral-400 dark:text-neutral-500">No active employees yet.</p>
            ) : (
              <ul className="org-tree">
                {forest.map((node) => (
                  <TreeNode key={node.id} node={node} />
                ))}
              </ul>
            )}
          </div>
          <style>{`
            .org-tree, .org-tree ul { display: flex; padding-top: 24px; position: relative; justify-content: center; }
            .org-tree { padding-top: 0; }
            .org-tree ul { margin-top: 0; }
            .org-tree li { list-style: none; position: relative; padding: 24px 12px 0 12px; text-align: center; }
            .org-tree li::before { content: ""; position: absolute; top: 0; left: 50%; width: 1px; height: 24px; background: var(--border-subtle); }
            .org-tree > li::before { display: none; }
            .org-tree li:only-child::before { display: none; }
            .org-tree ul::before { content: ""; position: absolute; top: 0; left: calc(25%); right: calc(25%); height: 1px; background: var(--border-subtle); }
            .org-tree > ul::before { display: none; }
            .org-tree li:only-child > ul::before { display: none; }
          `}</style>
        </>
      )}

      {view === "structure" && <StructureView supabase={supabase} employees={employees ?? []} />}

      {view === "vacancies" && <VacanciesView supabase={supabase} />}
    </div>
  );
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function DataQualityPanel({ supabase, orgId }: { supabase: SupabaseServerClient; orgId?: string }) {
  if (!orgId) return null;
  const [{ data: rows }, { data: heads }] = await Promise.all([
    supabase
      .from("ai_insights")
      .select("id, title, body, severity, entity_type, entity_id, suggested_action")
      .eq("org_id", orgId)
      .eq("category", "org_structure")
      .eq("status", "open"),
    supabase.from("employees").select("id").eq("org_id", orgId).eq("is_head_of_organisation", true),
  ]);

  // The head of the organisation (CEO) has no manager by design.
  const headIds = new Set((heads ?? []).map((h) => h.id as string));
  const findings = (rows ?? []).filter(
    (f) => !(f.title === "No current line manager on file" && f.entity_id && headIds.has(f.entity_id as string))
  );

  const counts = findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1;
    return acc;
  }, {});
  const total = findings.length;
  const severityOrder = ["critical", "high", "medium", "low"];
  const severityColor: Record<string, string> = {
    critical: "bg-red-100 text-red-700",
    high: "bg-orange-100 text-orange-700",
    medium: "bg-amber-100 text-amber-700",
    low: "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400",
  };
  const sorted = [...findings].sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity));

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Organisation data quality:</span>
          {total === 0 ? (
            <span className="text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">No open findings</span>
          ) : (
            severityOrder
              .filter((s) => counts[s])
              .map((s) => (
                <span key={s} className={`text-xs px-2 py-0.5 rounded-full ${severityColor[s]}`}>
                  {counts[s]} {s}
                </span>
              ))
          )}
        </div>
        <form
          action={async () => {
            "use server";
            await runOrganisationDataQuality();
          }}
        >
          <button className="text-xs bg-neutral-900 text-white rounded-lg px-3 py-1.5 font-medium">Run checks</button>
        </form>
      </div>
      {total > 0 && (
        <details className="mt-3" open>
          <summary className="text-xs font-medium text-brand-600 cursor-pointer">What needs fixing ({total})</summary>
          <ul className="mt-2 divide-y divide-neutral-100 dark:divide-neutral-800 text-sm">
            {sorted.map((f) => (
              <li key={f.id} className="py-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded-full mr-2 ${severityColor[f.severity] ?? ""}`}>{f.severity}</span>
                  <span className="font-medium text-neutral-900 dark:text-neutral-50">{f.title}</span>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{f.body}</p>
                  {f.suggested_action && <p className="text-xs text-neutral-400 dark:text-neutral-500">Fix: {f.suggested_action}</p>}
                </div>
                <div className="flex gap-3 shrink-0 text-xs font-medium">
                  {f.entity_type === "employee" && f.entity_id && (
                    <Link href={`/dashboard/employees/${f.entity_id}`} className="text-brand-600 hover:underline">Open profile</Link>
                  )}
                  <Link href="/dashboard/organogram?view=structure" className="text-brand-600 hover:underline">Fix in Structure</Link>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

async function HierarchyView({ supabase, orgId }: { supabase: SupabaseServerClient; orgId: string }) {
  const tree = await getOrgTree(supabase, orgId);

  if (tree.length === 0) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-6">
        <p className="text-sm text-neutral-400 dark:text-neutral-500">
          No organisation units yet — add one on the Structure tab, or none were found to backfill.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-5">
      <ul className="space-y-1">
        {tree.map((node) => (
          <UnitRow key={node.id} node={node} depth={0} />
        ))}
      </ul>
    </div>
  );
}

function UnitRow({ node, depth }: { node: OrgTreeNode; depth: number }) {
  return (
    <li>
      <div
        className={`flex items-center justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800 ${!node.isActive ? "opacity-50" : ""}`}
        style={{ paddingLeft: depth * 20 }}
      >
        <span className="text-sm">
          {node.name} <span className="text-xs text-neutral-400 dark:text-neutral-500 uppercase tracking-wide">{node.unitType}</span>
          {!node.isActive && <span className="text-xs text-neutral-400 dark:text-neutral-500"> (retired)</span>}
        </span>
        <span className="text-xs text-neutral-500 dark:text-neutral-400 flex gap-3">
          <span>{node.positionCount} position{node.positionCount === 1 ? "" : "s"}</span>
          <span>{node.employeeCount} filled</span>
          <span className={node.vacancyCount > 0 ? "text-amber-600 font-medium" : ""}>{node.vacancyCount} vacant</span>
        </span>
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <UnitRow key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

async function VacanciesView({ supabase }: { supabase: SupabaseServerClient }) {
  const { data: positions } = await supabase
    .from("positions")
    .select("id, title, position_code, approved_headcount, status, organisation_units(name)")
    .eq("is_active", true)
    .order("title");

  const positionIds = (positions ?? []).map((p) => p.id);
  let occupiedByPosition = new Map<string, number>();
  if (positionIds.length > 0) {
    const { data: openAssignments } = await supabase
      .from("employee_positions")
      .select("position_id")
      .in("position_id", positionIds)
      .eq("is_primary", true)
      .is("effective_to", null);
    occupiedByPosition = (openAssignments ?? []).reduce((map, row) => {
      map.set(row.position_id, (map.get(row.position_id) ?? 0) + 1);
      return map;
    }, new Map<string, number>());
  }

  const vacant = (positions ?? [])
    .map((p) => {
      const occupied = occupiedByPosition.get(p.id) ?? 0;
      return { ...p, occupied, vacancy: Math.max(0, p.approved_headcount - occupied) };
    })
    .filter((p) => p.vacancy > 0);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-5">
      <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">
        Open capacity ({vacant.length} position{vacant.length === 1 ? "" : "s"})
      </h2>
      {vacant.length === 0 ? (
        <p className="text-sm text-neutral-400 dark:text-neutral-500">No vacancies — every active position is fully occupied.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {vacant.map((p) => {
            const unit = p.organisation_units as unknown as { name: string } | null;
            return (
              <li key={p.id} className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-1.5">
                <span>
                  {p.title} {p.position_code && <span className="text-xs text-neutral-400 dark:text-neutral-500 font-mono">({p.position_code})</span>}{" "}
                  <span className="text-xs text-neutral-400 dark:text-neutral-500">{unit?.name}</span>
                </span>
                <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                  {p.occupied}/{p.approved_headcount} filled · {p.vacancy} open
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

async function StructureView({
  supabase,
  employees,
}: {
  supabase: SupabaseServerClient;
  employees: Employee[];
}) {
  const [{ data: units }, { data: locations }, { data: costCentres }, { data: positions }] = await Promise.all([
    supabase.from("organisation_units").select("id, name, unit_type, parent_id, is_active").order("name"),
    supabase.from("locations").select("id, name, is_remote").order("name"),
    supabase.from("cost_centres").select("id, code, name").order("code"),
    supabase
      .from("positions")
      .select("id, title, position_code, status, is_active, approved_headcount, organisation_units(name), locations(name)")
      .order("title"),
  ]);

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <section className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-5">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Departments / business units / teams</h2>
        <ul className="space-y-1.5 mb-4 text-sm">
          {(units ?? []).map((u) => (
            <li key={u.id} className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-1.5">
              <span className={!u.is_active ? "opacity-50" : ""}>
                {u.name} <span className="text-xs text-neutral-400 dark:text-neutral-500">({u.unit_type})</span>
              </span>
              <form action={deleteOrgUnit.bind(null, u.id)}>
                <button className="text-xs text-red-500 hover:underline">Remove</button>
              </form>
            </li>
          ))}
          {(!units || units.length === 0) && <p className="text-sm text-neutral-400 dark:text-neutral-500">None yet.</p>}
        </ul>
        <form action={createOrgUnit} className="flex flex-wrap gap-2 text-sm">
          <input name="name" placeholder="Name" required className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 flex-1 min-w-[120px]" />
          <select name="unit_type" defaultValue="department" className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 bg-white dark:bg-neutral-900">
            <option value="business_unit">Business unit</option>
            <option value="department">Department</option>
            <option value="team">Team</option>
          </select>
          <select name="parent_id" className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 bg-white dark:bg-neutral-900">
            <option value="">No parent</option>
            {(units ?? []).map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <button className="bg-brand-600 text-white rounded-lg px-3 py-1.5 font-medium">Add</button>
        </form>
      </section>

      <section className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-5">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Locations</h2>
        <ul className="space-y-1.5 mb-4 text-sm">
          {(locations ?? []).map((l) => (
            <li key={l.id} className="border-b border-neutral-100 dark:border-neutral-800 pb-1.5">
              {l.name} {l.is_remote && <span className="text-xs text-neutral-400 dark:text-neutral-500">(remote)</span>}
            </li>
          ))}
          {(!locations || locations.length === 0) && <p className="text-sm text-neutral-400 dark:text-neutral-500">None yet.</p>}
        </ul>
        <form action={createLocation} className="flex flex-wrap gap-2 text-sm items-center">
          <input name="name" placeholder="Name" required className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 flex-1 min-w-[120px]" />
          <input name="address" placeholder="Address (optional)" className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 flex-1 min-w-[120px]" />
          <label className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
            <input type="checkbox" name="is_remote" /> Remote
          </label>
          <button className="bg-brand-600 text-white rounded-lg px-3 py-1.5 font-medium">Add</button>
        </form>
      </section>

      <section className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-5">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Cost centres</h2>
        <ul className="space-y-1.5 mb-4 text-sm">
          {(costCentres ?? []).map((c) => (
            <li key={c.id} className="border-b border-neutral-100 dark:border-neutral-800 pb-1.5 font-mono text-xs">
              {c.code} — <span className="font-sans">{c.name}</span>
            </li>
          ))}
          {(!costCentres || costCentres.length === 0) && <p className="text-sm text-neutral-400 dark:text-neutral-500">None yet.</p>}
        </ul>
        <form action={createCostCentre} className="flex flex-wrap gap-2 text-sm">
          <input name="code" placeholder="Code" required className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 w-24" />
          <input name="name" placeholder="Name" required className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 flex-1 min-w-[120px]" />
          <button className="bg-brand-600 text-white rounded-lg px-3 py-1.5 font-medium">Add</button>
        </form>
      </section>

      <section className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-5">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Positions</h2>
        <ul className="space-y-1.5 mb-4 text-sm">
          {(positions ?? []).map((p) => {
            const unit = p.organisation_units as unknown as { name: string } | null;
            const loc = p.locations as unknown as { name: string } | null;
            return (
              <li key={p.id} className={`border-b border-neutral-100 dark:border-neutral-800 pb-1.5 flex items-center justify-between ${!p.is_active ? "opacity-50" : ""}`}>
                <span>
                  {p.title}{" "}
                  {p.position_code && <span className="text-xs text-neutral-400 dark:text-neutral-500 font-mono">{p.position_code}</span>}{" "}
                  <span className="text-xs text-neutral-400 dark:text-neutral-500">
                    {[unit?.name, loc?.name].filter(Boolean).join(" · ")} · headcount {p.approved_headcount}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === "occupied" ? "bg-green-100 text-green-700" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400"}`}>
                    {p.status}
                  </span>
                  <form action={setPositionActive.bind(null, p.id, !p.is_active)}>
                    <button className="text-xs text-neutral-500 dark:text-neutral-400 hover:underline">{p.is_active ? "Retire" : "Reactivate"}</button>
                  </form>
                </span>
              </li>
            );
          })}
          {(!positions || positions.length === 0) && <p className="text-sm text-neutral-400 dark:text-neutral-500">None yet.</p>}
        </ul>
        <form action={createPosition} className="flex flex-wrap gap-2 text-sm mb-4">
          <input name="title" placeholder="Title" required className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 flex-1 min-w-[120px]" />
          <input name="position_code" placeholder="Code (optional)" className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 w-32" />
          <input name="approved_headcount" type="number" min={1} defaultValue={1} className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 w-20" />
          <select name="organisation_unit_id" className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 bg-white dark:bg-neutral-900">
            <option value="">No department</option>
            {(units ?? []).map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <select name="location_id" className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 bg-white dark:bg-neutral-900">
            <option value="">No location</option>
            {(locations ?? []).map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <button className="bg-brand-600 text-white rounded-lg px-3 py-1.5 font-medium">Add</button>
        </form>

        <h3 className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 uppercase tracking-wide mb-2">Change assignment</h3>
        <p className="text-xs text-neutral-400 dark:text-neutral-500 mb-2">
          Assigns (or transfers) an employee to a position and, optionally, sets their line manager — effective-dated,
          transactional, and kept in sync with the employee&apos;s legacy department/manager fields.
        </p>
        <form action={assignEmployeePosition} className="flex flex-wrap gap-2 text-sm">
          <select name="employee_id" required className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 bg-white dark:bg-neutral-900 flex-1 min-w-[140px]">
            <option value="">Employee…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <select name="position_id" required className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 bg-white dark:bg-neutral-900 flex-1 min-w-[140px]">
            <option value="">Position…</option>
            {(positions ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.title}{p.position_code ? ` (${p.position_code})` : ""}</option>
            ))}
          </select>
          <select name="manager_id" className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 bg-white dark:bg-neutral-900 flex-1 min-w-[140px]">
            <option value="">Keep current manager</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <input name="effective_from" type="date" className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5" />
          <input name="reason" placeholder="Reason (optional)" className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 flex-1 min-w-[120px]" />
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
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50 whitespace-nowrap">{node.name}</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">{node.job_title}</p>
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
