import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePayrollExportBatch } from "@/lib/compensation/payroll-export-actions";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_export_batches")
    .select("id, period, status, row_count, checksum, exported_at")
    .order("exported_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ batches: data });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const formData = new FormData();
  formData.set("period", body.period ?? "");
  try {
    await generatePayrollExportBatch(formData);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
