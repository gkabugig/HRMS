"use server";

// Everything a branch kiosk can do. Each call re-checks the device cookie
// and the person's PIN; times are always the server's Kenya time, and every
// write goes through the service role (there are no client write policies
// on attendance since migration 0133).
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Db } from "@/lib/hub/context";
import { nairobiNow } from "@/lib/attendance/nairobi-time";
import { closeOpenBreaks } from "@/lib/attendance/breaks";
import { KIOSK_COOKIE, KIOSK_COOKIE_MAX_AGE, KIOSK_COOKIE_PATH, decodeKioskPhoto, requireKiosk, type KioskCtx } from "./kiosk";
import { MAX_PIN_ATTEMPTS, PIN_LOCK_MINUTES, newDeviceToken, normalisePairingCode, sha256, verifyPin } from "./secrets";
import { KIOSK_ACTION_LABEL, isKioskAction, nextKioskActions, type KioskAction } from "./rules";

export type PairResult = { error?: string; paired?: boolean };

export async function pairKiosk(_prev: PairResult, formData: FormData): Promise<PairResult> {
  const code = normalisePairingCode(String(formData.get("code") ?? ""));
  if (!code) return { error: "That code doesn't look right. It has 8 letters and numbers, like K7Q4-M9XP." };
  const db = createAdminClient() as Db;
  const { data: kiosk } = await db
    .from("branch_kiosks")
    .select("id, pairing_expires_at, revoked_at")
    .eq("pairing_code_hash", sha256(code))
    .maybeSingle();
  if (!kiosk || kiosk.revoked_at || !kiosk.pairing_expires_at || new Date(kiosk.pairing_expires_at) < new Date()) {
    return { error: "That code is wrong or has expired. Ask the owners for a new one." };
  }
  const token = newDeviceToken();
  const { error } = await db
    .from("branch_kiosks")
    .update({ token_hash: sha256(token), pairing_code_hash: null, pairing_expires_at: null, paired_at: new Date().toISOString() })
    .eq("id", kiosk.id);
  if (error) return { error: "Could not pair this device. Try again." };
  (await cookies()).set(KIOSK_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: KIOSK_COOKIE_PATH,
    maxAge: KIOSK_COOKIE_MAX_AGE,
  });
  return { paired: true };
}

type DayState = { attendanceId: string | null; clockIn: string | null; clockOut: string | null; openBreakId: string | null };

async function dayState(db: Db, employeeId: string, date: string): Promise<DayState> {
  const [{ data: att }, { data: open }] = await Promise.all([
    db.from("attendance").select("id, clock_in, clock_out").eq("employee_id", employeeId).eq("work_date", date).maybeSingle(),
    db.from("attendance_breaks").select("id").eq("employee_id", employeeId).is("ended_at", null).maybeSingle(),
  ]);
  return { attendanceId: att?.id ?? null, clockIn: att?.clock_in ?? null, clockOut: att?.clock_out ?? null, openBreakId: open?.id ?? null };
}

// The person must belong to this kiosk's branch and give their own PIN.
async function checkPerson(k: KioskCtx, employeeId: string, pin: string): Promise<{ name: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(employeeId)) throw new Error("Choose your name first.");
  const { data: emp } = await k.db.from("employees").select("id, name, status, branch_id, org_id").eq("id", employeeId).maybeSingle();
  if (!emp || emp.org_id !== k.orgId || emp.branch_id !== k.branchId || emp.status !== "Active") {
    throw new Error("You are not registered at this branch. Speak to your manager.");
  }
  const { data: pinRow } = await k.db.from("employee_kiosk_pins").select("pin_hash, failed_attempts, locked_until").eq("employee_id", employeeId).maybeSingle();
  if (!pinRow) throw new Error("You don't have a PIN yet. Ask your manager to set one.");
  if (pinRow.locked_until && new Date(pinRow.locked_until) > new Date()) {
    throw new Error(`Too many wrong PINs. Try again after ${new Date(pinRow.locked_until).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" })}.`);
  }
  if (!(await verifyPin(pin, pinRow.pin_hash))) {
    const attempts = (pinRow.failed_attempts ?? 0) + 1;
    const lock = attempts >= MAX_PIN_ATTEMPTS;
    await k.db
      .from("employee_kiosk_pins")
      .update({ failed_attempts: lock ? 0 : attempts, locked_until: lock ? new Date(Date.now() + PIN_LOCK_MINUTES * 60000).toISOString() : null })
      .eq("employee_id", employeeId);
    throw new Error(lock ? `Wrong PIN. You are locked out for ${PIN_LOCK_MINUTES} minutes.` : `Wrong PIN. ${MAX_PIN_ATTEMPTS - attempts} tries left.`);
  }
  if (pinRow.failed_attempts) await k.db.from("employee_kiosk_pins").update({ failed_attempts: 0, locked_until: null }).eq("employee_id", employeeId);
  return { name: emp.name as string };
}

export type IdentifyResult = { error?: string; name?: string; actions?: KioskAction[]; status?: string };

export async function identifyAtKiosk(employeeId: string, pin: string): Promise<IdentifyResult> {
  try {
    const k = await requireKiosk();
    const { name } = await checkPerson(k, employeeId, pin);
    const { date } = nairobiNow();
    const s = await dayState(k.db, employeeId, date);
    const actions = nextKioskActions({ clockIn: s.clockIn, clockOut: s.clockOut, onBreak: !!s.openBreakId });
    const status = !s.clockIn
      ? "Not clocked in yet today."
      : s.clockOut
        ? `You clocked out at ${String(s.clockOut).slice(0, 5)}. See you tomorrow.`
        : s.openBreakId
          ? "You are on lunch."
          : `Clocked in since ${String(s.clockIn).slice(0, 5)}.`;
    return { name, actions, status };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export type PunchResult = { error?: string; message?: string };

export async function punchAtKiosk(employeeId: string, pin: string, action: string, photo: string): Promise<PunchResult> {
  try {
    if (!isKioskAction(action)) return { error: "Choose what you are doing." };
    const k = await requireKiosk();
    const { name } = await checkPerson(k, employeeId, pin);
    const jpeg = decodeKioskPhoto(photo);
    const { date, time } = nairobiNow();
    const s = await dayState(k.db, employeeId, date);
    if (!nextKioskActions({ clockIn: s.clockIn, clockOut: s.clockOut, onBreak: !!s.openBreakId }).includes(action)) {
      return { error: "That isn't possible right now. Start again." };
    }

    const path = `${k.orgId}/${k.branchId}/${date}/${employeeId}/${action}-${time.replace(":", "")}-${randomUUID().slice(0, 8)}.jpg`;
    const up = await k.db.storage.from("kiosk-photos").upload(path, jpeg, { contentType: "image/jpeg", upsert: false });
    if (up.error) return { error: "Could not save your photo. Check the internet connection and try again." };

    if (action === "clock_in") {
      const fields = { clock_in: time, source: "kiosk", clock_in_photo_path: path, clock_in_kiosk_id: k.kioskId };
      const { error } = s.attendanceId
        ? await k.db.from("attendance").update(fields).eq("id", s.attendanceId)
        : await k.db.from("attendance").insert({ employee_id: employeeId, work_date: date, ...fields });
      if (error) throw new Error(error.message);
    } else if (action === "clock_out") {
      const { error } = await k.db.from("attendance").update({ clock_out: time, clock_out_photo_path: path, clock_out_kiosk_id: k.kioskId }).eq("id", s.attendanceId);
      if (error) throw new Error(error.message);
      await closeOpenBreaks(k.db, employeeId);
    } else if (action === "start_lunch") {
      const { error } = await k.db
        .from("attendance_breaks")
        .insert({ org_id: k.orgId, employee_id: employeeId, work_date: date, kind: "lunch", start_photo_path: path, kiosk_id: k.kioskId });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await k.db.from("attendance_breaks").update({ ended_at: new Date().toISOString(), end_photo_path: path }).eq("id", s.openBreakId);
      if (error) throw new Error(error.message);
    }

    return { message: `${KIOSK_ACTION_LABEL[action]} recorded for ${name} at ${time}.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}
