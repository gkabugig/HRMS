// Anonymous survey results. Pure. Nothing is shown until enough people have responded.
export const MIN_RESPONSES = 5;

export type Q = { id: string; position: number; prompt: string; qtype: "scale" | "text" };
export type A = { question_id: string; response_key: string; scale_value: number | null; text_value: string | null };

export type QuestionResult =
  | { id: string; prompt: string; qtype: "scale"; average: number; counts: [number, number, number, number, number]; answered: number }
  | { id: string; prompt: string; qtype: "text"; comments: string[] };

export function summarise(questions: Q[], answers: A[], responders: number, min = MIN_RESPONSES): { hidden: boolean; responders: number; results: QuestionResult[] } {
  if (responders < min) return { hidden: true, responders, results: [] };
  const results: QuestionResult[] = [];
  for (const q of [...questions].sort((a, b) => a.position - b.position)) {
    const mine = answers.filter((a) => a.question_id === q.id);
    if (q.qtype === "scale") {
      const counts: [number, number, number, number, number] = [0, 0, 0, 0, 0];
      let sum = 0;
      let n = 0;
      for (const a of mine) {
        if (a.scale_value && a.scale_value >= 1 && a.scale_value <= 5) {
          counts[a.scale_value - 1]++;
          sum += a.scale_value;
          n++;
        }
      }
      results.push({ id: q.id, prompt: q.prompt, qtype: "scale", average: n ? Math.round((sum / n) * 100) / 100 : 0, counts, answered: n });
    } else {
      // Sorted so the order of the comments tells nothing about who wrote what.
      const comments = mine.map((a) => (a.text_value ?? "").trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
      results.push({ id: q.id, prompt: q.prompt, qtype: "text", comments });
    }
  }
  return { hidden: false, responders, results };
}

export function parseQuestions(raw: string): { prompt: string; qtype: "scale" | "text" }[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (/^text:/i.test(l) ? { prompt: l.replace(/^text:\s*/i, ""), qtype: "text" as const } : { prompt: l, qtype: "scale" as const }))
    .filter((q) => q.prompt.length > 0);
}

export const TEMPLATES: Record<"pulse" | "engagement" | "wellbeing", { title: string; description: string; questions: string[] }> = {
  wellbeing: {
    title: "Wellbeing check-in",
    description: "A short, anonymous check on how people are coping. 1 = strongly disagree, 5 = strongly agree.",
    questions: [
      "My workload is manageable.",
      "I can switch off from work outside working hours.",
      "I feel supported by my manager.",
      "I feel safe to speak up when something is wrong.",
      "I look forward to coming to work.",
      "text: What one thing would make work easier for you?",
    ],
  },
  pulse: {
    title: "Quick pulse",
    description: "Five quick questions. 1 = strongly disagree, 5 = strongly agree.",
    questions: ["I know what is expected of me.", "I have what I need to do my job well.", "My work is recognised.", "I would recommend this organisation as a place to work.", "text: Anything else you would like leadership to know?"],
  },
  engagement: {
    title: "Engagement survey",
    description: "How connected people feel to their work and the organisation. 1 = strongly disagree, 5 = strongly agree.",
    questions: [
      "I understand how my work contributes to the organisation's goals.",
      "I have opportunities to learn and grow here.",
      "I trust the leadership of this organisation.",
      "My pay and benefits are fair for my work.",
      "I see myself working here in two years.",
      "My team works well together.",
      "text: What should we start, stop or continue doing?",
    ],
  },
};
