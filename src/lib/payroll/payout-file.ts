// Payout files for an approved payroll run: a bank transfer file and an
// M-Pesa bulk-payment file. Pure functions (no DB / framework) so the rules
// are unit tested. Anyone we cannot pay correctly is left OUT of the file and
// listed in the exceptions instead - a wrong phone number or account would
// send real money to the wrong place, so we never guess or pad details.

export type PayoutLine = {
  staffNo: string;
  name: string;
  net: number;
  phone: string | null;
  bankName: string | null;
  accountNo: string | null;
  branchCode: string | null;
};

export type PayoutException = { staff_no: string; name: string; net: number; reason: string };

export type PayoutFile = {
  rows: Record<string, string | number>[];
  exceptions: PayoutException[];
  total: number;
};

// Accepts 0712345678, 0112345678, +254712345678, 254712345678, 712345678.
// Returns 2547XXXXXXXX / 2541XXXXXXXX, or null if it is not a Kenyan mobile.
export function normalizeKenyanMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[\s()-]/g, "").replace(/^\+/, "");
  if (!/^\d+$/.test(digits)) return null;
  let national: string;
  if (digits.startsWith("254")) national = digits.slice(3);
  else if (digits.startsWith("0")) national = digits.slice(1);
  else national = digits;
  return /^[17]\d{8}$/.test(national) ? `254${national}` : null;
}

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function clean(s: string | null | undefined): string {
  return (s ?? "").trim();
}

export function buildBankFile(lines: PayoutLine[], period: string): PayoutFile {
  const rows: PayoutFile["rows"] = [];
  const exceptions: PayoutException[] = [];
  let total = 0;
  for (const l of lines) {
    const net = roundMoney(l.net);
    const base = { staff_no: l.staffNo, name: l.name, net };
    if (!(net > 0)) {
      exceptions.push({ ...base, reason: "Net pay is zero or negative" });
      continue;
    }
    const bank = clean(l.bankName);
    const account = clean(l.accountNo).replace(/\s+/g, "");
    if (!bank || !account) {
      exceptions.push({ ...base, reason: "Missing bank name or account number" });
      continue;
    }
    rows.push({
      staff_no: l.staffNo,
      name: l.name,
      bank_name: bank,
      account_no: account,
      branch_code: clean(l.branchCode),
      amount: net,
      reference: `Salary ${period}`,
    });
    total += net;
  }
  return { rows, exceptions, total: roundMoney(total) };
}

export function buildMpesaFile(lines: PayoutLine[], period: string): PayoutFile {
  const rows: PayoutFile["rows"] = [];
  const exceptions: PayoutException[] = [];
  let total = 0;
  for (const l of lines) {
    const net = roundMoney(l.net);
    const base = { staff_no: l.staffNo, name: l.name, net };
    if (!(net > 0)) {
      exceptions.push({ ...base, reason: "Net pay is zero or negative" });
      continue;
    }
    const phone = normalizeKenyanMobile(l.phone);
    if (!phone) {
      exceptions.push({ ...base, reason: l.phone ? "Phone number is not a valid Kenyan mobile" : "No phone number on file" });
      continue;
    }
    rows.push({
      phone,
      amount: net,
      name: l.name,
      staff_no: l.staffNo,
      reference: `Salary ${period}`,
    });
    total += net;
  }
  return { rows, exceptions, total: roundMoney(total) };
}
