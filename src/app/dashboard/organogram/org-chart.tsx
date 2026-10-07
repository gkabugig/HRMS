"use client";

// Interactive org chart in the style of diagramming tools such as Lucidchart:
// card nodes, elbow connectors, auto-layout, drag-to-pan, wheel/button zoom,
// collapse/expand branches, department colour-coding and search.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Maximize2, ChevronDown, ChevronRight, Search, Printer } from "lucide-react";
import { CARD_H, CARD_W, layoutOrganogram, type OrgPerson } from "@/lib/organogram/layout";

const PALETTE = ["--vivid-1", "--vivid-2", "--vivid-3", "--vivid-4", "--vivid-5", "--vivid-6", "--vivid-7", "--vivid-8"];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

export default function OrgChart({ people }: { people: OrgPerson[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [view, setView] = useState({ x: 20, y: 20, k: 1 });
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  const layout = useMemo(() => layoutOrganogram(people, collapsed), [people, collapsed]);
  const colours = useMemo(() => {
    const depts = [...new Set(people.map((p) => p.department))].sort();
    return new Map(depts.map((d, i) => [d, `var(${PALETTE[i % PALETTE.length]})`]));
  }, [people]);

  const q = query.trim().toLowerCase();
  const matches = (p: OrgPerson) => q && (p.name.toLowerCase().includes(q) || p.job_title.toLowerCase().includes(q) || p.department.toLowerCase().includes(q));
  const matchCount = q ? people.filter(matches).length : 0;

  const fit = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const k = Math.min(1, (el.clientWidth - 40) / layout.width, (el.clientHeight - 40) / layout.height);
    setView({ k, x: Math.max(20, (el.clientWidth - layout.width * k) / 2), y: 20 });
  }, [layout.width, layout.height]);

  useEffect(() => {
    fit();
  }, [fit]);

  // Non-passive wheel listener so the page doesn't scroll while zooming.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setView((v) => {
        const k = Math.min(2, Math.max(0.2, v.k * (e.deltaY < 0 ? 1.1 : 0.9)));
        return { k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const zoom = (f: number) => setView((v) => ({ ...v, k: Math.min(2, Math.max(0.2, v.k * f)) }));
  const toggle = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const managers = useMemo(() => new Set(people.map((p) => p.reporting_manager_id).filter(Boolean) as string[]), [people]);

  if (people.length === 0) return <p className="text-sm text-neutral-400 dark:text-neutral-500">No active employees yet.</p>;

  const btn = "p-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] hover:bg-neutral-100 dark:hover:bg-neutral-800";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a person, title or department"
            className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] w-64"
          />
        </div>
        {q && <span className="text-xs text-neutral-500">{matchCount} match{matchCount === 1 ? "" : "es"}</span>}
        <div className="flex-1" />
        <button className={btn} onClick={() => zoom(0.85)} aria-label="Zoom out"><Minus size={14} /></button>
        <span className="text-xs w-10 text-center text-neutral-500">{Math.round(view.k * 100)}%</span>
        <button className={btn} onClick={() => zoom(1.15)} aria-label="Zoom in"><Plus size={14} /></button>
        <button className={btn} onClick={fit} aria-label="Fit to screen" title="Fit to screen"><Maximize2 size={14} /></button>
        <button className="text-xs px-2.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface)]" onClick={() => setCollapsed(new Set())}>Expand all</button>
        <button className="text-xs px-2.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface)]" onClick={() => setCollapsed(new Set(managers))}>Collapse all</button>
        <button className={btn} onClick={() => window.print()} aria-label="Print" title="Print"><Printer size={14} /></button>
      </div>

      <div
        ref={box}
        className="relative h-[70vh] min-h-[420px] overflow-hidden rounded-xl border border-[var(--border-subtle)] cursor-grab active:cursor-grabbing select-none print:h-auto print:overflow-visible"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("a,button")) return;
          drag.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) setView((v) => ({ ...v, x: d.ox + e.clientX - d.sx, y: d.oy + e.clientY - d.sy }));
        }}
        onPointerUp={() => (drag.current = null)}
      >
        <div className="absolute inset-0 -z-0 bg-[var(--surface-muted)]" style={{ backgroundImage: "radial-gradient(var(--border-subtle) 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
        <div className="absolute origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, width: layout.width, height: layout.height }}>
          <svg className="absolute inset-0 overflow-visible pointer-events-none" width={layout.width} height={layout.height}>
            {layout.edges.map((e) => {
              const midY = (e.y1 + e.y2) / 2;
              return (
                <path
                  key={`${e.from}-${e.to}`}
                  d={`M ${e.x1} ${e.y1} V ${midY} H ${e.x2} V ${e.y2}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  className="text-neutral-300 dark:text-neutral-600"
                />
              );
            })}
          </svg>
          {layout.nodes.map((n) => {
            const colour = colours.get(n.person.department) ?? "var(--vivid-1)";
            const hit = matches(n.person);
            const dim = q && !hit;
            return (
              <div key={n.person.id} className="absolute" style={{ left: n.x, top: n.y, width: CARD_W, height: CARD_H, opacity: dim ? 0.35 : 1 }}>
                <Link
                  href={`/dashboard/employees/${n.person.id}`}
                  className={`flex h-full items-center gap-2.5 rounded-xl border bg-[var(--surface)] pl-3 pr-2 shadow-sm hover:shadow-md transition-shadow ${hit ? "ring-2 ring-offset-1" : ""}`}
                  style={{ borderColor: "var(--border-subtle)", borderLeft: `4px solid ${colour}`, ...(hit ? { boxShadow: `0 0 0 2px ${colour}` } : {}) }}
                >
                  <span className="shrink-0 w-9 h-9 rounded-full grid place-items-center text-xs font-semibold text-white" style={{ background: colour }}>
                    {initials(n.person.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-neutral-900 dark:text-neutral-50 truncate">{n.person.name}</span>
                    <span className="block text-xs text-neutral-500 dark:text-neutral-400 truncate">{n.person.job_title}</span>
                    <span className="block text-[10px] uppercase tracking-wide truncate" style={{ color: colour }}>
                      {n.person.is_head_of_organisation ? "Head of organisation" : n.person.department}
                    </span>
                  </span>
                </Link>
                {n.directReports > 0 && (
                  <button
                    onClick={() => toggle(n.person.id)}
                    className="absolute left-1/2 -bottom-3 -translate-x-1/2 flex items-center gap-0.5 rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:text-neutral-300 shadow-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 print:hidden"
                    aria-label={n.collapsed ? "Expand team" : "Collapse team"}
                  >
                    {n.collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                    {n.collapsed ? n.reports : n.directReports}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600 dark:text-neutral-300">
        {[...colours.entries()].map(([dept, c]) => (
          <span key={dept} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
            {dept}
          </span>
        ))}
        <span className="text-neutral-400">· Drag to pan · scroll to zoom · click a card to open the profile</span>
      </div>
    </div>
  );
}
