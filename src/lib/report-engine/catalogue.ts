export type ReportDef = {
  key: string;
  title: string;
  description: string;
  group: "People" | "Time and attendance" | "Pay and statutory" | "Compliance and risk" | "Hiring and development";
  hrOnly: boolean; // managers may open the others (limited to their own team)
  usesDates: boolean;
  usesPeople: boolean; // department / employment-type filters make sense
  maxDays?: number; // heavy day-by-day reports are capped to this window
  analyticsView?: string; // matching dashboard in Workforce Analytics
};

export const REPORTS: ReportDef[] = [
  { key: "headcount", title: "Headcount and tenure", description: "Who works here, by department, with length of service.", group: "People", hrOnly: false, usesDates: true, usesPeople: true, analyticsView: "headcount" },
  { key: "turnover", title: "Turnover and exits", description: "Who left, why, and the turnover rate for the period.", group: "People", hrOnly: true, usesDates: true, usesPeople: true, analyticsView: "headcount" },
  { key: "diversity", title: "Workforce profile", description: "Gender, age and employment mix of active staff.", group: "People", hrOnly: true, usesDates: false, usesPeople: true },
  { key: "attendance", title: "Attendance, lateness and absence", description: "Present, late and absent days per person; repeat lateness flagged.", group: "Time and attendance", hrOnly: false, usesDates: true, usesPeople: true, maxDays: 92, analyticsView: "attendance" },
  { key: "leave", title: "Leave taken and balances", description: "Leave taken, annual leave balances and the value of unused days.", group: "Time and attendance", hrOnly: false, usesDates: true, usesPeople: true, analyticsView: "leave" },
  { key: "payroll", title: "Payroll cost by month", description: "Gross, deductions, net pay and total employer cost per month.", group: "Pay and statutory", hrOnly: true, usesDates: true, usesPeople: true, analyticsView: "cost" },
  { key: "payroll-department", title: "Payroll cost by department", description: "Which departments the pay bill goes to.", group: "Pay and statutory", hrOnly: true, usesDates: true, usesPeople: true, analyticsView: "cost" },
  { key: "statutory", title: "Statutory remittances", description: "PAYE, NSSF, SHIF and housing levy to pay each month, with due dates.", group: "Pay and statutory", hrOnly: true, usesDates: true, usesPeople: true },
  { key: "compliance", title: "Compliance register", description: "Every tracked document and whether it is valid, expiring or expired.", group: "Compliance and risk", hrOnly: true, usesDates: false, usesPeople: true, analyticsView: "compliance" },
  { key: "disciplinary", title: "Disciplinary actions", description: "Hearings and outcomes, with repeat cases flagged.", group: "Compliance and risk", hrOnly: true, usesDates: true, usesPeople: true },
  { key: "recruitment", title: "Recruitment", description: "Jobs, applicants, hires and time to hire.", group: "Hiring and development", hrOnly: true, usesDates: true, usesPeople: false, analyticsView: "recruitment" },
  { key: "training", title: "Training and development", description: "Enrolments, completion rate and mandatory training outstanding.", group: "Hiring and development", hrOnly: false, usesDates: true, usesPeople: true, analyticsView: "learning" },
];

export const GROUPS = ["People", "Time and attendance", "Pay and statutory", "Compliance and risk", "Hiring and development"] as const;

export function findReport(key: string): ReportDef | undefined {
  return REPORTS.find((r) => r.key === key);
}
