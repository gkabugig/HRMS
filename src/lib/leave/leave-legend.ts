// Shared colour + short-code legend for leave types across the calendar
// grid, event chips and the toolbar legend. Codes (not colour alone) carry
// the meaning for accessibility (spec §35).
export const LEAVE_TYPE_STYLE: Record<string, { bg: string; text: string; code: string }> = {
  Annual: { bg: "bg-brand-500", text: "text-white", code: "AL" },
  Sick: { bg: "bg-amber-500", text: "text-white", code: "SL" },
  Compassionate: { bg: "bg-slate-500", text: "text-white", code: "CL" },
  Maternity: { bg: "bg-pink-500", text: "text-white", code: "ML" },
  Paternity: { bg: "bg-indigo-500", text: "text-white", code: "PL" },
  Unpaid: { bg: "bg-neutral-400", text: "text-white", code: "UL" },
  Study: { bg: "bg-teal-500", text: "text-white", code: "STL" },
};

export function leaveStyle(type: string) {
  return LEAVE_TYPE_STYLE[type] ?? { bg: "bg-neutral-400", text: "text-white", code: type.slice(0, 2).toUpperCase() };
}
