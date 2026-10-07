import type { AttendanceSnapshot as AttendanceSnapshotData } from "@/lib/dashboard/dashboard-types";
import { Doughnut } from "@/components/charts/charts";
import ChartCard from "./chart-card";

export default function AttendanceSnapshotCard({ attendance }: { attendance: AttendanceSnapshotData }) {
  const items = [
    { label: "Present", value: attendance.present, color: "var(--vivid-3)", href: "/dashboard/attendance" },
    { label: "Late", value: attendance.late, color: "var(--vivid-4)", href: "/dashboard/attendance" },
    { label: "Absent", value: attendance.absent, color: "var(--vivid-2)", href: "/dashboard/attendance" },
    { label: "On leave", value: attendance.onLeave, color: "var(--vivid-5)", href: "/dashboard/leave" },
  ];
  return (
    <ChartCard title="Attendance — Today" href="/dashboard/attendance" linkLabel="Attendance" accent="var(--vivid-3)">
      {items.every((i) => i.value === 0) ? (
        <p className="text-sm text-neutral-400 dark:text-neutral-500 py-6 text-center">No attendance recorded yet today.</p>
      ) : (
        <Doughnut items={items} palette="vivid" centreLabel="today" />
      )}
      {attendance.missingClockOut > 0 && <p className="text-[11px] text-amber-600 mt-2">{attendance.missingClockOut} missing clock-out</p>}
    </ChartCard>
  );
}
