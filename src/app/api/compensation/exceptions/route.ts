import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Area 17 §8.8 GET /api/compensation/exceptions — approved out-of-band
// compensation exceptions, HR/admin only per RLS.
export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("compensation_exceptions")
    .select("id, change_request_id, reason, authorised_by, authorised_at, expiry_date, compensation_change_requests(employee_id, status)")
    .order("authorised_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ exceptions: data });
}
