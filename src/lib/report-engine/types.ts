export type Cell = string | number | null;
export type ColumnFormat = "kes" | "int" | "pct" | "decimal" | "text";

export type ReportColumn = { key: string; label: string; align?: "right"; format?: ColumnFormat };
export type ReportRow = { cells: Record<string, Cell>; href?: string };
export type ReportStat = { label: string; value: string; hint?: string; tone?: "amber" | "red" | "green" };

export type ReportResult = {
  key: string;
  title: string;
  description: string;
  periodLabel: string;
  stats: ReportStat[];
  chart?: { title: string; kind?: "bars" | "doughnut"; items: { label: string; value: number; color?: string }[]; format?: ColumnFormat };
  columns: ReportColumn[];
  rows: ReportRow[];
  notes: string[];
};

export type ReportFilters = {
  from: string; // YYYY-MM-DD
  to: string;
  department: string | null;
  employmentType: string | null;
};

// Raw rows the pure builders work from (the loader maps database rows into these).
export type EmployeeRow = {
  id: string;
  staff_no: string;
  name: string;
  department: string;
  job_title: string;
  employment_type: string;
  date_of_hire: string;
  status: string;
  gender: string | null;
  date_of_birth: string | null;
  basic: number;
};
export type OffboardingRow = {
  employee_id: string;
  exit_type: string;
  notice_date: string;
  last_working_day: string;
  exit_interview_completed: boolean;
  severance_pay: number | null;
};
export type AttendanceRow = { employee_id: string; work_date: string; clock_in: string | null; clock_out: string | null };
export type LeaveRow = { employee_id: string; leave_type: string; start_date: string; end_date: string; days: number; status: string };
export type PayslipRow = {
  period: string; // YYYY-MM
  employee_id: string;
  gross: number;
  nssf: number;
  shif: number;
  housing_levy: number;
  paye: number;
  other_deductions: number;
  net: number;
  employer_nssf: number;
  employer_housing_levy: number;
};
export type ComplianceRow = { employee_id: string | null; doc_type: string; label: string; expiry_date: string; alert_threshold_days: number };
export type EnrollmentRow = {
  employee_id: string;
  course_name: string;
  mandatory: boolean;
  cost: number;
  status: string;
  enrolled_on: string;
  completed_on: string | null;
};
export type DisciplinaryRow = { employee_id: string; hearing_date: string; action_type: string; reason: string; outcome: string | null };
export type RequisitionRow = { id: string; role: string; department: string; headcount: number; status: string; approval_status: string; raised_on: string };
export type CandidateRow = { id: string; requisition_id: string; source: string | null; stage: string; rejection_reason: string | null; added_on: string };
export type HistoryRow = { candidate_id: string; to_stage: string; changed_at: string };
