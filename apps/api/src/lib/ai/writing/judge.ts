// Writing grading prompt: a classroom teacher reading a learner's piece — four plain criteria
// scored 0-100 against what the learner's level can be expected to do, plus a short comment.

export const WRITING_JUDGE_SYSTEM = [
  "You are a warm, experienced English teacher marking a piece of writing from one of your own learners.",
  "Score it like homework in a class, not like an exam: judge it against what a learner at THIS level can be expected to write.",
  "Score four criteria, each an integer 0-100:",
  "- content: does it answer the task, are the ideas relevant and developed?",
  "- organisation: is it ordered sensibly, with paragraphs/sentences that connect?",
  "- vocabulary: are the words suitable for the topic and used correctly?",
  "- grammar: are the sentences accurate for this level?",
  "Scale: 90+ = excellent for the level · 75-89 = good, a few slips · 60-74 = fine, clear points to fix · 40-59 = needs work · below 40 = does not yet answer the task.",
  "Only use evidence from the learner's text — never invent mistakes.",
  "Write `analysis` and `feedback` in Vietnamese. In `feedback` speak as the teacher: call yourself 'Cô' and the learner 'em'.",
  "Return ONLY the JSON object, nothing outside it.",
].join("\n");

/** Expectation per CEFR band — what "good" looks like at the learner's level. */
function levelExpectation(level: string): string {
  const L = level.toUpperCase();
  if (L.startsWith("C")) return "Advanced (C1-C2): clear position, varied and precise vocabulary, complex sentences used accurately.";
  if (L.startsWith("B2")) return "Upper-intermediate (B2): developed ideas with reasons and examples, linking words, mostly accurate complex sentences.";
  if (L.startsWith("B1")) return "Intermediate (B1): connected paragraphs on familiar topics, simple reasons, common tenses mostly correct.";
  return "Beginner (A1-A2): short simple and compound sentences, basic tenses, everyday words. Do not expect complex structures.";
}

export function buildWritingJudge(v: Record<string, unknown>): string {
  const name = String(v.student_name || "").trim() || "em";
  const outline = (v.outline as string[] | undefined) ?? [];
  const sample = String(v.sample || "").slice(0, 1200).trim();
  const text = String(v.text || "").slice(0, 6000).trim();
  const level = String(v.level || "").trim();
  const prev = v.previous as { attempt_no: number; score?: number | null; text: string; feedback?: string | null } | null;

  return [
    `Exercise: ${v.title}`,
    `Learner: ${name}${level ? ` · level ${level}` : ""}`,
    `Expectation at this level: ${levelExpectation(level)}`,
    "",
    `Task:\n"""\n${v.prompt}\n"""`,
    outline.length ? `Suggested outline:\n${outline.map((o) => `- ${o}`).join("\n")}` : "",
    sample ? `Model answer (reference only, never quote it to the learner as theirs):\n"""\n${sample}\n"""` : "",
    "",
    `Learner's piece (${v.word_count} words):\n"""\n${text}\n"""`,
    prev
      ? [
          "",
          `This is a revision. Their best earlier draft (attempt ${prev.attempt_no}${prev.score != null ? `, score ${prev.score}` : ""}):`,
          `"""\n${prev.text}\n"""`,
          prev.feedback ? `Your earlier comment:\n"""\n${prev.feedback}\n"""` : "",
          "Say briefly in the feedback what improved and what still needs the same fix.",
        ].join("\n")
      : "",
    "",
    "Feedback shape (Vietnamese, under 160 words): one specific thing done well; 2-3 fixes, each quoting the learner's words and giving the corrected version; one next step.",
    'Return JSON: {"analysis": string, "content": int, "organisation": int, "vocabulary": int, "grammar": int, "feedback": string}.',
  ]
    .filter(Boolean)
    .join("\n");
}
