export type AttendanceStatus = "Present" | "Late" | "Absent" | "On Leave" | "Missing Clock-out" | "Off Day" | "Holiday";

export type Shift = { start_time: string; end_time: string; grace_minutes: number };

export type AttendanceRecord = {
  id: string;
  employee_id: string;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  source: string | null;
  employees: { name: string; department: string } | null;
};

export type ClassifiedDay = {
  status: AttendanceStatus;
  late: boolean;
  missingClockOut: boolean;
  overtimeHours: number;
  hoursWorked: number | null;
};

export type AttendanceException = {
  id: string;
  type: "late_arrival" | "missing_clock_out" | "overtime" | "absent_without_leave" | "unscheduled_attendance" | "schedule_mismatch";
  employeeId: string;
  employeeName: string;
  workDate: string;
  detail: string;
};

export type AttendanceKpis = {
  present: number;
  late: number;
  absent: number;
  missingClockOut: number;
  overtimeHours: number;
};
