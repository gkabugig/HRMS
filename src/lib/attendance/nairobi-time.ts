// Attendance dates/times are Kenyan wall-clock (EAT, UTC+3, no DST). Using
// the server's UTC date would put a 01:00 clock-in on the previous day.
export function nairobiNow(now: Date = new Date()): { date: string; time: string } {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  return { date, time };
}
