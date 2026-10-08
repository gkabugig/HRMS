// Compares who works at each branch with the minimum-staffing rules. Pure.
export type Rule = { id: string; branch_id: string | null; job_title: string; min_count: number };
export type StaffMember = { branch_id: string | null; job_title: string };
export type Shortfall = { branchId: string; ruleId: string; jobTitle: string; required: number; actual: number; missing: number };

const norm = (s: string) => s.trim().toLowerCase();

export function staffingShortfalls(branchIds: string[], rules: Rule[], staff: StaffMember[]): Shortfall[] {
  const out: Shortfall[] = [];
  for (const b of branchIds) {
    for (const r of rules) {
      if (r.branch_id && r.branch_id !== b) continue;
      const actual = staff.filter((s) => s.branch_id === b && norm(s.job_title).includes(norm(r.job_title))).length;
      if (actual < r.min_count) out.push({ branchId: b, ruleId: r.id, jobTitle: r.job_title, required: r.min_count, actual, missing: r.min_count - actual });
    }
  }
  return out;
}
