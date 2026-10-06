// Help Centre content for admin, HR and managers (employees have their own
// Help page under My Space). Plain data so it is easy to edit and so a test
// can check every link points at a real page.
import type { UserRole } from "@/lib/auth/roles";

export type HelpArticle = {
  id: string;
  category: string;
  title: string;
  summary: string;
  steps: string[];
  href?: string;
  linkLabel?: string;
  roles: UserRole[];
};

const STAFF: UserRole[] = ["admin", "hr"];
const MGR: UserRole[] = ["manager"];
const ALL: UserRole[] = ["admin", "hr", "manager"];

export const HELP_ARTICLES: HelpArticle[] = [
  // ---- Everyone in this centre ----
  {
    id: "approvals",
    category: "Approvals & requests",
    title: "Approve or reject something waiting for you",
    summary: "Leave, payroll steps and other items that need your decision.",
    steps: [
      "Open Approvals from the menu (a number badge shows how many are waiting).",
      "Open an item, read the details, then choose Approve or Reject and add a short reason.",
      "If someone else decides first, you will be told it was already decided - nothing is applied twice.",
    ],
    href: "/dashboard/approvals",
    linkLabel: "Go to Approvals",
    roles: ALL,
  },
  {
    id: "hr-requests",
    category: "Approvals & requests",
    title: "Raise or follow up an HR request",
    summary: "Ask HR for something and track the answer.",
    steps: [
      "Open My HR Requests.",
      "Start a new request, pick the type and describe what you need.",
      "Come back to the same page to see the status and replies.",
    ],
    href: "/dashboard/service-requests",
    linkLabel: "Go to HR Requests",
    roles: ALL,
  },
  {
    id: "assistant",
    category: "Getting around",
    title: "Ask the AI Assistant",
    summary: "Type a question in plain English; it only sees what your role is allowed to see.",
    steps: [
      "Open AI Assistant from the menu.",
      "Ask things like \"Who is on leave this week?\" or \"How many days notice for termination?\".",
      "Check important answers against the source - the assistant can make mistakes.",
    ],
    href: "/dashboard/assistant",
    linkLabel: "Open AI Assistant",
    roles: ALL,
  },
  {
    id: "notifications",
    category: "Getting around",
    title: "Find your notifications",
    summary: "The bell at the top right and the Notifications page list everything addressed to you.",
    steps: ["Click the bell for the latest items.", "Open Notifications to see all of them and mark them read."],
    href: "/dashboard/notifications",
    linkLabel: "Go to Notifications",
    roles: ALL,
  },

  // ---- Admin & HR ----
  {
    id: "add-employee",
    category: "People",
    title: "Add a new employee",
    summary: "Create the employee record first; a login is a separate step.",
    steps: [
      "Open Employees and choose Add employee.",
      "Fill in name, department, job details and pay. Add bank details and a phone number if they will be paid by bank or M-Pesa.",
      "Save. To let them sign in, create a login for them in Settings (see 'Create a login').",
    ],
    href: "/dashboard/employees",
    linkLabel: "Go to Employees",
    roles: STAFF,
  },
  {
    id: "create-login",
    category: "People",
    title: "Create a login (username or email)",
    summary: "Staff without an email address can sign in with a username instead.",
    steps: [
      "Open Settings, then Manage Users (admin only).",
      "Type a username (3-30 letters, numbers, dots or dashes) or a full email, a temporary password and a role.",
      "Optionally link the login to an employee record, then Create login.",
      "Tell the person their username and temporary password directly - no email is sent.",
    ],
    href: "/dashboard/settings",
    linkLabel: "Go to Settings",
    roles: ["admin"],
  },
  {
    id: "offboarding",
    category: "People",
    title: "Offboard someone who is leaving",
    summary: "Exit checklist, asset returns, severance and certificate of service.",
    steps: [
      "Open Offboarding and start a case for the employee.",
      "Work through the checklist and record returned assets.",
      "Calculate severance or notice where it applies and issue the certificate of service.",
    ],
    href: "/dashboard/offboarding",
    linkLabel: "Go to Offboarding",
    roles: STAFF,
  },
  {
    id: "documents",
    category: "People",
    title: "Store and find employee documents",
    summary: "Contracts, IDs and certificates are kept privately per employee.",
    steps: [
      "Open an employee's profile and go to their Documents tab, or use the Documents page.",
      "Upload the file and choose its type.",
      "Only HR/admin and the employee themselves can open it.",
    ],
    href: "/dashboard/documents",
    linkLabel: "Go to Documents",
    roles: STAFF,
  },
  {
    id: "branches-gps",
    category: "Attendance",
    title: "Set up a branch for GPS clock-in",
    summary: "Give a branch a location and radius so staff clock-ins are checked against it.",
    steps: [
      "Open Branches and edit the branch.",
      "Enter its latitude and longitude (from Google Maps: right-click the place and copy the numbers) and a radius in metres (150 is the default).",
      "Employees clocking in from outside the radius are still recorded but flagged 'Outside area' for HR.",
    ],
    href: "/dashboard/branches",
    linkLabel: "Go to Branches",
    roles: STAFF,
  },
  {
    id: "attendance-review",
    category: "Attendance",
    title: "Review attendance and location flags",
    summary: "See who clocked in, when, and whether they were on site.",
    steps: [
      "Open Attendance and pick the date.",
      "The Location column shows 'On site' or 'Outside area (X m)'.",
      "Late and rest-day flags are calculated for you.",
    ],
    href: "/dashboard/attendance",
    linkLabel: "Go to Attendance",
    roles: STAFF,
  },
  {
    id: "shifts",
    category: "Attendance",
    title: "Set working shifts",
    summary: "Define shift patterns so lateness is measured per shift, not one fixed time.",
    steps: ["Open Shifts and create a shift with start and end times.", "Assign employees to it."],
    href: "/dashboard/shifts",
    linkLabel: "Go to Shifts",
    roles: STAFF,
  },
  {
    id: "leave-approve",
    category: "Leave",
    title: "Approve or decline leave",
    summary: "The Leave menu item shows a badge with how many requests are pending.",
    steps: ["Open Leave.", "Review dates and balance, then Approve or Decline with a note."],
    href: "/dashboard/leave",
    linkLabel: "Go to Leave",
    roles: STAFF,
  },
  {
    id: "run-payroll",
    category: "Payroll",
    title: "Run payroll for a month",
    summary: "Create the run, calculate, review exceptions, approve, then export payments.",
    steps: [
      "Open Payroll and start a run for the month.",
      "Calculate. PAYE, NSSF, SHIF and the Housing Levy are worked out automatically.",
      "Fix any exceptions listed (for example missing bank details), then send for review.",
      "Once approved, publish payslips and download the payment files.",
    ],
    href: "/dashboard/payroll",
    linkLabel: "Go to Payroll",
    roles: STAFF,
  },
  {
    id: "payout-files",
    category: "Payroll",
    title: "Download the bank or M-Pesa payment file",
    summary: "Available only after the run is approved.",
    steps: [
      "Open the approved payroll run and find Payment & Outputs.",
      "Download the Bank Transfer File or the M-Pesa Bulk Payment File.",
      "If someone is missing from a file, download 'Who is missing payout details', fix their bank or phone number on the employee record, and download again.",
      "Upload the file to your bank or M-Pesa portal yourself - this system does not move money.",
    ],
    href: "/dashboard/payroll",
    linkLabel: "Go to Payroll",
    roles: STAFF,
  },
  {
    id: "audit-log",
    category: "Admin",
    title: "See who changed what",
    summary: "The Audit Centre lists every recorded action, newest first. It is read-only.",
    steps: ["Open Audit Log from the menu.", "Narrow it down with the date range, category, risk level or the search box."],
    href: "/dashboard/audit-log",
    linkLabel: "Go to Audit Log",
    roles: STAFF,
  },
  {
    id: "menu-access",
    category: "Admin",
    title: "Change who sees which menu item",
    summary: "Admins control what each role can see.",
    steps: ["Open Settings.", "In the roles and access section, switch menu items on or off for each role.", "People see the change the next time the page loads."],
    href: "/dashboard/settings",
    linkLabel: "Go to Settings",
    roles: ["admin"],
  },

  // ---- Managers ----
  {
    id: "mgr-leave",
    category: "My team",
    title: "Approve your team's leave",
    summary: "You only see requests from people who report to you.",
    steps: ["Open Team Leave.", "Review the dates and who else is away, then Approve or Decline."],
    href: "/dashboard/manager/leave",
    linkLabel: "Go to Team Leave",
    roles: MGR,
  },
  {
    id: "mgr-attendance",
    category: "My team",
    title: "Check your team's attendance",
    summary: "Who is in, late or absent today.",
    steps: ["Open Team Attendance.", "Pick a date to see each person's clock-in and any flags."],
    href: "/dashboard/manager/attendance",
    linkLabel: "Go to Team Attendance",
    roles: MGR,
  },
  {
    id: "mgr-performance",
    category: "My team",
    title: "Complete appraisals for your team",
    summary: "Rate and comment on each direct report during a review cycle.",
    steps: ["Open Team Performance.", "Choose a person and fill in their appraisal.", "Submit - HR sees it once you do."],
    href: "/dashboard/manager/performance",
    linkLabel: "Go to Team Performance",
    roles: MGR,
  },
  {
    id: "mgr-requests",
    category: "My team",
    title: "See your team's HR requests",
    summary: "Requests your people have raised with HR.",
    steps: ["Open Team Requests.", "Open a request to see its status and replies."],
    href: "/dashboard/manager/requests",
    linkLabel: "Go to Team Requests",
    roles: MGR,
  },
  {
    id: "mgr-assignments",
    category: "My team",
    title: "Give your team tasks",
    summary: "Assign work and follow progress.",
    steps: ["Open Team Assignments.", "Create an assignment, choose who it is for and a due date.", "Check the page to see what is done and what is overdue."],
    href: "/dashboard/assignments",
    linkLabel: "Go to Team Assignments",
    roles: MGR,
  },
];

export function articlesForRole(role: UserRole): HelpArticle[] {
  return HELP_ARTICLES.filter((a) => a.roles.includes(role));
}
