"use server";

// Employee self clock-in/out with GPS. The browser only reports raw
// coordinates; everything that matters is decided here: who is clocking
// (derived from the session, never the form), which branch/area applies,
// the distance, and the inside/outside verdict.
//
// Writes use the service-role client deliberately: attendance_self_insert
// lets an employee insert their own row but there is no self UPDATE policy
// (clock-out), and widening RLS would also let an employee rewrite their own
// recorded times or location. The write is limited to the caller's own
// employee_id with server-generated times, so the elevated client can't be
// steered to another person's row.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateGeofence, isValidPoint } from "./geo";
import { nairobiNow } from "./nairobi-time";
import { closeOpenBreaks } from "./breaks";

export type SelfClockState = { error?: string; success?: string; warning?: string };

export async function selfClockAction(_prev: SelfClockState, formData: FormData): Promise<SelfClockState> {
  try {
    const direction = String(formData.get("direction"));
    if (direction !== "in" && direction !== "out") return { error: "Invalid request." };

    const point = { lat: Number(formData.get("lat")), lng: Number(formData.get("lng")) };
    if (!isValidPoint(point)) return { error: "We couldn't read your location. Allow location access and try again." };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not signed in." };
    const { data: appUser } = await supabase.from("app_users").select("employee_id").eq("id", user.id).maybeSingle();
    if (!appUser?.employee_id) return { error: "Your login isn't linked to an employee record." };
    const employeeId = appUser.employee_id as string;

    const { data: employee } = await supabase
      .from("employees")
      .select("branches(latitude, longitude, geofence_radius_m)")
      .eq("id", employeeId)
      .maybeSingle();
    const rawBranch = (employee as unknown as { branches: unknown } | null)?.branches;
    const branch = (Array.isArray(rawBranch) ? rawBranch[0] : rawBranch) as
      | { latitude: number | null; longitude: number | null; geofence_radius_m: number }
      | null
      | undefined;
    const verdict = evaluateGeofence(point, branch ?? null);

    const { date, time } = nairobiNow();
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("attendance")
      .select("id, clock_in, clock_out")
      .eq("employee_id", employeeId)
      .eq("work_date", date)
      .maybeSingle();

    if (direction === "in") {
      if (existing?.clock_in) return { error: `You already clocked in today at ${String(existing.clock_in).slice(0, 5)}.` };
      const fields = {
        clock_in: time,
        source: "self_gps",
        clock_in_lat: point.lat,
        clock_in_lng: point.lng,
        clock_in_distance_m: verdict?.distanceM ?? null,
        clock_in_in_geofence: verdict?.inside ?? null,
      };
      const { error } = existing
        ? await admin.from("attendance").update(fields).eq("id", existing.id)
        : await admin.from("attendance").insert({ employee_id: employeeId, work_date: date, ...fields });
      if (error) return { error: error.message };
    } else {
      if (!existing?.clock_in) return { error: "Clock in first before clocking out." };
      if (existing.clock_out) return { error: `You already clocked out today at ${String(existing.clock_out).slice(0, 5)}.` };
      const { error } = await admin
        .from("attendance")
        .update({
          clock_out: time,
          clock_out_lat: point.lat,
          clock_out_lng: point.lng,
          clock_out_distance_m: verdict?.distanceM ?? null,
          clock_out_in_geofence: verdict?.inside ?? null,
        })
        .eq("id", existing.id);
      if (error) return { error: error.message };
      await closeOpenBreaks(admin as never, employeeId);
    }

    revalidatePath("/dashboard/me/attendance");
    revalidatePath("/dashboard/attendance");
    const label = direction === "in" ? "Clocked in" : "Clocked out";
    if (verdict && !verdict.inside) {
      return {
        success: `${label} at ${time}.`,
        warning: `You are about ${verdict.distanceM} m from your branch, outside the allowed area. HR can see this.`,
      };
    }
    return { success: `${label} at ${time}.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not record your attendance." };
  }
}
