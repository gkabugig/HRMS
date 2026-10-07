import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Downloads one letter as text. Row-level security decides who may read it:
// HR any letter in the organisation; an employee only their own, once released.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data } = await supabase.from("reward_letters").select("title, body, release_date").eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Letter not found." }, { status: 404 });
  const name = `${String(data.title).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`;
  return new NextResponse(data.body as string, { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
}
