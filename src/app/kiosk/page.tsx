import type { Metadata } from "next";
import { getKiosk } from "@/lib/branch-ops/kiosk";
import PairForm from "./pair-form";
import KioskApp from "./kiosk-app";

export const metadata: Metadata = { title: "Clocking kiosk" };

export default async function KioskPage() {
  const kiosk = await getKiosk();

  if (!kiosk) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-neutral-950 text-white p-6">
        <PairForm />
      </main>
    );
  }

  const [{ data: staff }, { data: pins }] = await Promise.all([
    kiosk.db.from("employees").select("id, name").eq("org_id", kiosk.orgId).eq("branch_id", kiosk.branchId).eq("status", "Active").order("name"),
    kiosk.db.from("employee_kiosk_pins").select("employee_id").eq("org_id", kiosk.orgId),
  ]);
  const withPin = new Set((pins ?? []).map((p) => p.employee_id as string));

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <KioskApp
        branchName={kiosk.branchName}
        staff={(staff ?? []).map((s) => ({ id: s.id as string, name: s.name as string, hasPin: withPin.has(s.id as string) }))}
      />
    </main>
  );
}
