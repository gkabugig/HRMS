import { describe, it, expect } from "vitest";
import { layoutOrganogram, CARD_W, type OrgPerson } from "./layout";

const p = (id: string, mgr: string | null, extra: Partial<OrgPerson> = {}): OrgPerson => ({
  id, name: id, job_title: "t", department: "d", reporting_manager_id: mgr, ...extra,
});

describe("layoutOrganogram", () => {
  const people = [p("ceo", null, { is_head_of_organisation: true }), p("a", "ceo"), p("b", "ceo"), p("a1", "a"), p("a2", "a")];

  it("centres a parent over its children and links them", () => {
    const l = layoutOrganogram(people, new Set());
    const get = (id: string) => l.nodes.find((n) => n.person.id === id)!;
    const mid = (get("a").x + get("b").x) / 2;
    expect(get("ceo").x).toBeCloseTo(mid);
    expect(l.edges).toHaveLength(4);
    expect(get("ceo").reports).toBe(4);
    expect(get("a1").y).toBeGreaterThan(get("a").y);
  });

  it("collapsed nodes hide their subtree", () => {
    const l = layoutOrganogram(people, new Set(["a"]));
    expect(l.nodes.map((n) => n.person.id).sort()).toEqual(["a", "b", "ceo"]);
    expect(l.nodes.find((n) => n.person.id === "a")!.collapsed).toBe(true);
  });

  it("no overlap between siblings and survives cycles / orphans", () => {
    const cyc = [p("x", "y"), p("y", "x"), p("z", "missing")];
    const l = layoutOrganogram(cyc, new Set());
    expect(l.nodes).toHaveLength(3);
    const xs = l.nodes.filter((n) => n.y === 0).map((n) => n.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(CARD_W);
  });
});
