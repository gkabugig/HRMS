import { describe, expect, it } from "vitest";
import { MIN_RESPONSES, parseQuestions, summarise, TEMPLATES, type A, type Q } from "./survey-engine";

const qs: Q[] = [
  { id: "q1", position: 1, prompt: "Workload ok", qtype: "scale" },
  { id: "q2", position: 2, prompt: "Comments", qtype: "text" },
];
const answersFor = (n: number): A[] =>
  Array.from({ length: n }, (_, i) => [
    { question_id: "q1", response_key: `r${i}`, scale_value: (i % 5) + 1, text_value: null },
    { question_id: "q2", response_key: `r${i}`, scale_value: null, text_value: i % 2 ? `comment ${i}` : "" },
  ]).flat();

describe("survey results", () => {
  it("hides everything until enough people have responded", () => {
    const r = summarise(qs, answersFor(MIN_RESPONSES - 1), MIN_RESPONSES - 1);
    expect(r.hidden).toBe(true);
    expect(r.results).toEqual([]);
  });
  it("averages scale answers and counts each score", () => {
    const r = summarise(qs, answersFor(5), 5);
    expect(r.hidden).toBe(false);
    const q1 = r.results[0];
    expect(q1.qtype).toBe("scale");
    if (q1.qtype === "scale") {
      expect(q1.average).toBe(3);
      expect(q1.counts).toEqual([1, 1, 1, 1, 1]);
    }
  });
  it("lists non-empty comments in alphabetical order, not submission order", () => {
    const r = summarise(qs, answersFor(10), 10);
    const q2 = r.results[1];
    expect(q2.qtype === "text" && q2.comments).toEqual(["comment 1", "comment 3", "comment 5", "comment 7", "comment 9"]);
  });
  it("parses questions, treating a text: prefix as a written answer", () => {
    expect(parseQuestions("Pay is fair\n\ntext: Any comments?\n  I feel valued ")).toEqual([
      { prompt: "Pay is fair", qtype: "scale" },
      { prompt: "Any comments?", qtype: "text" },
      { prompt: "I feel valued", qtype: "scale" },
    ]);
  });
  it("ships ready-made templates", () => {
    expect(TEMPLATES.wellbeing.questions.length).toBeGreaterThan(3);
  });
});
