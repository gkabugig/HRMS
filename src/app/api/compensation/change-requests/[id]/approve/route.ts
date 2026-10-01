import { NextResponse } from "next/server";
import { directlyDecideCompensationChangeRequest } from "@/lib/compensation/change-request-actions";

// Area 17 §8.8 POST /api/compensation/change-requests/:id/approve.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const decision = body.decision === "rejected" ? "rejected" : "approved";
  try {
    await directlyDecideCompensationChangeRequest(id, decision);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
