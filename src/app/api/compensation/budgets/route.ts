import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("compensation_budgets")
    .select("id, organisation_unit_id, budget_period_start, budget_period_end, budgeted_amount, currency")
    .order("budget_period_start", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ budgets: data });
}
