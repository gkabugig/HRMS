import { describe, it, expect } from "vitest";
import { canMoveTo, checkRejectionReason } from "./stages";
import { summariseScorecards, validScore, cardAverage } from "./scorecard";
import { buildRecruitmentReport } from "./report";

describe("stage rules", () => {
  it("blocks no-op, hired and moving from hired", () => {
    expect(canMoveTo("Screened", "Screened")).toBeTruthy();
    expect(canMoveTo("Offered", "Hired")).toBeTruthy();
    expect(canMoveTo("Hired", "Screened")).toBeTruthy();
    expect(canMoveTo("Screened", "Shortlisted")).toBeNull();
    expect(canMoveTo("Rejected", "Screened")).toBeNull();
  });
  it("needs a rejection reason", () => {
    expect(checkRejectionReason("")).toBeTruthy();
    expect(checkRejectionReason("  ")).toBeTruthy();
    expect(checkRejectionReason("Failed interview")).toBeNull();
  });
});

describe("scorecards", () => {
  const a = { skills: 5, experience: 4, communication: 3, culture_fit: 4, recommendation: "Yes" as const };
  const b = { skills: 3, experience: 3, communication: 3, culture_fit: 3, recommendation: "No" as const };
  it("averages and tallies", () => {
    expect(cardAverage(a)).toBe(4);
    const s = summariseScorecards([a, b]);
    expect(s.count).toBe(2);
    expect(s.average).toBe(3.5);
    expect(s.recommendations.Yes).toBe(1);
    expect(s.recommendations.No).toBe(1);
  });
  it("handles no cards and validates scores", () => {
    expect(summariseScorecards([]).average).toBeNull();
    expect(validScore(0)).toBe(false);
    expect(validScore(6)).toBe(false);
    expect(validScore(2.5)).toBe(false);
    expect(validScore(5)).toBe(true);
  });
});

describe("recruitment report", () => {
  const cands = [
    { id: "1", source: "Referral", stage: "Hired", rejection_reason: null, added_on: "2026-09-01T00:00:00Z" },
    { id: "2", source: "Referral", stage: "Rejected", rejection_reason: "Failed interview", added_on: "2026-09-02T00:00:00Z" },
    { id: "3", source: "Careers page", stage: "Screened", rejection_reason: null, added_on: "2026-09-03T00:00:00Z" },
    { id: "4", source: null, stage: "Rejected", rejection_reason: null, added_on: "2026-09-03T00:00:00Z" },
  ];
  const hist = [
    { candidate_id: "1", to_stage: "Screened", changed_at: "2026-09-01T00:00:00Z" },
    { candidate_id: "1", to_stage: "Interviewed", changed_at: "2026-09-10T00:00:00Z" },
    { candidate_id: "1", to_stage: "Hired", changed_at: "2026-09-21T00:00:00Z" },
    { candidate_id: "2", to_stage: "Interviewed", changed_at: "2026-09-12T00:00:00Z" },
  ];
  const r = buildRecruitmentReport(cands, hist);
  it("computes time to hire, funnel, sources and reasons", () => {
    expect(r.avgTimeToHireDays).toBe(20);
    expect(r.funnel.find((f) => f.stage === "Interviewed")!.count).toBe(2);
    expect(r.funnel.find((f) => f.stage === "Hired")!.count).toBe(1);
    expect(r.sources[0]).toMatchObject({ source: "Referral", applicants: 2, hired: 1, hireRate: 50 });
    expect(r.sources.some((s) => s.source === "Unknown")).toBe(true);
    expect(r.rejectionReasons.find((x) => x.reason === "No reason recorded")!.count).toBe(1);
  });
});

import { validateCv, safeFileName } from "./cv";
describe("cv validation", () => {
  it("accepts none, pdf and word; rejects others and big files", () => {
    expect(validateCv(null)).toBeNull();
    expect(validateCv({ name: "a.pdf", size: 1000 })).toBeNull();
    expect(validateCv({ name: "a.DOCX", size: 1000 })).toBeNull();
    expect(validateCv({ name: "a.exe", size: 1000 })).toBeTruthy();
    expect(validateCv({ name: "a.pdf", size: 6 * 1024 * 1024 })).toBeTruthy();
  });
  it("makes safe file names", () => {
    expect(safeFileName("../../my cv (1).pdf")).toBe("my_cv_1_.pdf");
  });
});

import { candidateEmailDraft, mailtoLink } from "./email-draft";
describe("candidate email drafts", () => {
  it("greets by first name and mentions the role", () => {
    const d = candidateEmailDraft({ stage: "Rejected", name: "Jane Wanjiru", role: "Accountant", orgName: "Acme" });
    expect(d.body).toContain("Dear Jane");
    expect(d.body).toContain("Accountant");
    expect(d.body).toContain("Acme");
  });
  it("builds an encoded mailto link", () => {
    const l = mailtoLink("a@b.com", { subject: "Hi there", body: "Line1\nLine2" });
    expect(l).toBe("mailto:a%40b.com?subject=Hi%20there&body=Line1%0ALine2");
  });
});

import { validateApplication, isAcceptingApplications } from "./application";
describe("public applications", () => {
  const ok = { name: "Jane Wanjiru", email: "jane@example.com", phone: "0712 345 678", consent: true };
  it("accepts a good application and rejects bad ones", () => {
    expect(validateApplication(ok)).toBeNull();
    expect(validateApplication({ ...ok, name: "J" })).toBeTruthy();
    expect(validateApplication({ ...ok, email: "nope" })).toBeTruthy();
    expect(validateApplication({ ...ok, phone: "123" })).toBeTruthy();
    expect(validateApplication({ ...ok, consent: false })).toBeTruthy();
  });
  it("only accepts applications for open, approved, published, unexpired jobs", () => {
    const job = { status: "Open", approval_status: "Approved", published: true, closing_date: "2026-10-30" };
    expect(isAcceptingApplications(job, "2026-10-07")).toBe(true);
    expect(isAcceptingApplications({ ...job, closing_date: null }, "2026-10-07")).toBe(true);
    expect(isAcceptingApplications({ ...job, closing_date: "2026-10-01" }, "2026-10-07")).toBe(false);
    expect(isAcceptingApplications({ ...job, published: false }, "2026-10-07")).toBe(false);
    expect(isAcceptingApplications({ ...job, status: "Closed" }, "2026-10-07")).toBe(false);
    expect(isAcceptingApplications({ ...job, approval_status: "Pending" }, "2026-10-07")).toBe(false);
  });
});
