// Ready-to-send candidate emails (opened in the HR person's own mail app, so
// the message comes from them, not from a no-reply address).
export function candidateEmailDraft(input: { stage: string; name: string; role: string; orgName?: string }): { subject: string; body: string } {
  const first = input.name.trim().split(/\s+/)[0] || "there";
  const sign = `Kind regards,\nHuman Resources${input.orgName ? `\n${input.orgName}` : ""}`;
  switch (input.stage) {
    case "Rejected":
      return {
        subject: `Your application for ${input.role}`,
        body: `Dear ${first},\n\nThank you for applying for the ${input.role} position and for the time you put into your application. After careful consideration we will not be taking your application further on this occasion.\n\nWe appreciate your interest and wish you every success.\n\n${sign}`,
      };
    case "Shortlisted":
      return {
        subject: `You've been shortlisted: ${input.role}`,
        body: `Dear ${first},\n\nThank you for applying for the ${input.role} position. We are pleased to tell you that you have been shortlisted. We will be in touch shortly about the next step.\n\n${sign}`,
      };
    case "Interviewed":
    case "Screened":
    case "Applied":
      return {
        subject: `Your application for ${input.role}`,
        body: `Dear ${first},\n\nThank you for your interest in the ${input.role} position. We have received your application and will update you as soon as we have progressed.\n\n${sign}`,
      };
    case "Offered":
      return {
        subject: `Offer of employment: ${input.role}`,
        body: `Dear ${first},\n\nWe are delighted to offer you the position of ${input.role}. Please find the offer details attached. Kindly confirm your acceptance by reply.\n\n${sign}`,
      };
    default:
      return { subject: `Your application for ${input.role}`, body: `Dear ${first},\n\n\n${sign}` };
  }
}

export function mailtoLink(to: string, draft: { subject: string; body: string }): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
}
