"use server";

// Command palette search (spec §13). Permission-filtered by construction:
// this runs as the signed-in user through the regular server client, so
// RLS restricts the employee rows returned exactly as it would on the
// Employees page — a manager only gets their team, an employee only
// themselves.
import { createClient } from "@/lib/supabase/server";

export type CommandSearchResult = {
  employees: { id: string; name: string; staff_no: string; department: string }[];
};

export async function searchCommand(query: string): Promise<CommandSearchResult> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { employees: [] };

  // Two plain ilike queries rather than a single `.or(...)` filter string —
  // avoids building a PostgREST filter expression out of raw user input.
  const supabase = await createClient();
  const [{ data: byName }, { data: byStaffNo }] = await Promise.all([
    supabase.from("employees").select("id, name, staff_no, department").eq("status", "Active").ilike("name", `%${trimmed}%`).limit(6),
    supabase.from("employees").select("id, name, staff_no, department").eq("status", "Active").ilike("staff_no", `%${trimmed}%`).limit(6),
  ]);

  const seen = new Set<string>();
  const employees = [...(byName ?? []), ...(byStaffNo ?? [])].filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  }).slice(0, 6);

  return { employees };
}
