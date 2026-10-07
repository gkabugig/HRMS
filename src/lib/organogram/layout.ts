// Tidy top-down tree layout for the visual organogram (pure, no React).
// Each node is a fixed-size card; a parent is centred over its visible
// children; collapsed nodes are laid out as leaves.
export type OrgPerson = {
  id: string;
  name: string;
  job_title: string;
  department: string;
  reporting_manager_id: string | null;
  is_head_of_organisation?: boolean;
};

export const CARD_W = 208;
export const CARD_H = 76;
const GAP_X = 28;
const GAP_Y = 56;

export type LaidOutNode = {
  person: OrgPerson;
  x: number; // left edge of the card
  y: number; // top edge
  reports: number; // total people beneath (all depths)
  directReports: number;
  collapsed: boolean;
};
export type Edge = { from: string; to: string; x1: number; y1: number; x2: number; y2: number };
export type OrgLayout = { nodes: LaidOutNode[]; edges: Edge[]; width: number; height: number };

export function layoutOrganogram(people: OrgPerson[], collapsed: Set<string>): OrgLayout {
  const byId = new Map(people.map((p) => [p.id, p]));
  const children = new Map<string, OrgPerson[]>();
  const roots: OrgPerson[] = [];
  for (const p of people) {
    const m = p.reporting_manager_id;
    if (m && m !== p.id && byId.has(m)) {
      if (!children.has(m)) children.set(m, []);
      children.get(m)!.push(p);
    } else roots.push(p);
  }
  const byName = (a: OrgPerson, b: OrgPerson) => a.name.localeCompare(b.name);
  roots.sort((a, b) => Number(!!b.is_head_of_organisation) - Number(!!a.is_head_of_organisation) || byName(a, b));
  for (const list of children.values()) list.sort(byName);

  const nodes: LaidOutNode[] = [];
  const edges: Edge[] = [];
  const seen = new Set<string>();
  let maxDepth = 0;

  const countBelow = (id: string, guard = new Set<string>()): number => {
    if (guard.has(id)) return 0;
    guard.add(id);
    return (children.get(id) ?? []).reduce((n, c) => n + 1 + countBelow(c.id, guard), 0);
  };

  // Returns the subtree width and places nodes relative to `left`.
  function place(p: OrgPerson, left: number, depth: number): { width: number; centre: number } {
    seen.add(p.id);
    maxDepth = Math.max(maxDepth, depth);
    const kids = (children.get(p.id) ?? []).filter((c) => !seen.has(c.id));
    const isCollapsed = collapsed.has(p.id) && kids.length > 0;
    const y = depth * (CARD_H + GAP_Y);
    const idx = nodes.length;
    nodes.push({ person: p, x: 0, y, reports: countBelow(p.id), directReports: kids.length, collapsed: isCollapsed });

    if (isCollapsed) {
      const hide = (id: string) => {
        for (const c of children.get(id) ?? []) {
          if (!seen.has(c.id)) {
            seen.add(c.id);
            hide(c.id);
          }
        }
      };
      hide(p.id);
    }
    if (kids.length === 0 || isCollapsed) {
      nodes[idx].x = left;
      return { width: CARD_W, centre: left + CARD_W / 2 };
    }
    let cursor = left;
    const centres: { id: string; centre: number }[] = [];
    for (const k of kids) {
      const r = place(k, cursor, depth + 1);
      centres.push({ id: k.id, centre: r.centre });
      cursor += r.width + GAP_X;
    }
    const width = Math.max(CARD_W, cursor - GAP_X - left);
    const centre = (centres[0].centre + centres[centres.length - 1].centre) / 2;
    nodes[idx].x = centre - CARD_W / 2;
    for (const c of centres) {
      edges.push({ from: p.id, to: c.id, x1: centre, y1: y + CARD_H, x2: c.centre, y2: y + CARD_H + GAP_Y });
    }
    return { width, centre };
  }

  let cursor = 0;
  for (const r of roots) {
    if (seen.has(r.id)) continue;
    const res = place(r, cursor, 0);
    cursor += res.width + GAP_X * 2;
  }
  // Anyone only reachable through a reporting cycle: show as their own roots.
  for (const p of people) {
    if (!seen.has(p.id)) {
      const res = place(p, cursor, 0);
      cursor += res.width + GAP_X * 2;
    }
  }

  const width = Math.max(CARD_W, cursor - GAP_X * 2);
  const height = (maxDepth + 1) * CARD_H + maxDepth * GAP_Y;
  return { nodes, edges, width, height };
}
