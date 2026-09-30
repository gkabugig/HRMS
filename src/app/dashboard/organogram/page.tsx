import { createClient } from "@/lib/supabase/server";

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

export default async function OrganogramPage() {
  const supabase = await createClient();
  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, job_title, department, reporting_manager_id")
    .eq("status", "Active")
    .order("name");

  const forest = buildForest(employees ?? []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Organogram</h1>
        <p className="text-sm text-neutral-500">
          Built from each employee&apos;s reporting manager — set or change that on the
          Employees page to reshape the chart.
        </p>
      </div>

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
