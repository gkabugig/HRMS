// Letter templates with the approved figures merged in (spec §13). Pure.
const kes = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;
const TYPE_NAME: Record<string, string> = { bonus: "performance bonus", incentive: "incentive payment", spot: "spot award", retention: "retention payment", referral: "referral reward", long_service: "long-service award" };

export function meritLetter(i: { name: string; pct: number; oldSalary: number; newSalary: number; effective: string; orgName: string }): { title: string; body: string } {
  return {
    title: "Salary review outcome",
    body: [
      `Dear ${i.name},`,
      "",
      `Following the performance review, we are pleased to confirm an increase of ${i.pct}% to your basic salary, effective ${i.effective}.`,
      "",
      `Your basic salary moves from ${kes(i.oldSalary)} to ${kes(i.newSalary)} per month. All other terms and conditions of your employment remain as set out in your contract of employment unless you are told otherwise in writing.`,
      "",
      "Thank you for your contribution.",
      "",
      `Human Resources, ${i.orgName}`,
    ].join("\n"),
  };
}

export function earningLetter(i: { name: string; type: string; amount: number; payPeriod: string; reason?: string | null; orgName: string }): { title: string; body: string } {
  const what = TYPE_NAME[i.type] ?? "reward";
  return {
    title: `Your ${what}`,
    body: [
      `Dear ${i.name},`,
      "",
      `We are pleased to confirm a ${what} of ${kes(i.amount)}${i.reason ? ` in recognition of: ${i.reason}` : ""}.`,
      "",
      `It will be paid with your salary for ${i.payPeriod}. As employment income, it is subject to PAYE and the other statutory deductions.`,
      "",
      "Thank you for your contribution.",
      "",
      `Human Resources, ${i.orgName}`,
    ].join("\n"),
  };
}
