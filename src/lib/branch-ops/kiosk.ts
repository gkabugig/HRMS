// Which paired kiosk (if any) is making this request. A kiosk is a branch
// tablet, not a signed-in user: it holds a random token in an httpOnly
// cookie, and only the token's SHA-256 is stored in branch_kiosks.
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Db } from "@/lib/hub/context";
import { sha256 } from "./secrets";

export const KIOSK_COOKIE = "stk_kiosk";
export const KIOSK_COOKIE_PATH = "/kiosk";
// Browsers cap cookie lifetime at 400 days; the owners can revoke any time.
export const KIOSK_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

export type KioskCtx = { db: Db; kioskId: string; orgId: string; branchId: string; branchName: string; kioskName: string };

export async function getKiosk(): Promise<KioskCtx | null> {
  const token = (await cookies()).get(KIOSK_COOKIE)?.value;
  if (!token || token.length < 20) return null;
  const db = createAdminClient() as Db;
  const { data } = await db
    .from("branch_kiosks")
    .select("id, org_id, branch_id, name, revoked_at, branches(name)")
    .eq("token_hash", sha256(token))
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  const branch = (Array.isArray(data.branches) ? data.branches[0] : data.branches) as { name: string } | null;
  // Last-seen lets the owners spot a tablet that has been switched off.
  await db.from("branch_kiosks").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id);
  return { db, kioskId: data.id, orgId: data.org_id, branchId: data.branch_id, branchName: branch?.name ?? "Branch", kioskName: data.name };
}

export async function requireKiosk(): Promise<KioskCtx> {
  const k = await getKiosk();
  if (!k) throw new Error("This device is not paired with a branch any more. Ask the owners for a new pairing code.");
  return k;
}

const MAX_PHOTO_BYTES = 600 * 1024;

// The kiosk sends a JPEG captured from the live camera as a data URL.
export function decodeKioskPhoto(dataUrl: string): Buffer {
  const prefix = "data:image/jpeg;base64,";
  if (!dataUrl.startsWith(prefix)) throw new Error("No photo was taken. Look at the camera and try again.");
  const buf = Buffer.from(dataUrl.slice(prefix.length), "base64");
  if (buf.length < 2000 || buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error("The photo didn't come through. Try again.");
  if (buf.length > MAX_PHOTO_BYTES) throw new Error("The photo is too large. Try again.");
  return buf;
}
