// Dạng #2 — GHÉP CẶP: nối TỪ ↔ NGHĨA. TÁI DÙNG MatchingInput của bài Quiz (màu theo cặp +
// đường cong nối + bấm để gỡ) để đồng bộ logic & style với câu hỏi matching. Sau khi kiểm,
// truyền `pairResult` để tô xanh/đỏ ngay (Quiz không có bước này).
import { useMemo, useState } from "react";
import { Link2 } from "lucide-react";
import type { PublicQuestion } from "@msyen/shared";
import { Button } from "../../ui";
import { MatchingInput } from "../inputs/MatchingInput";
import { decodeMatching } from "../../../lib/practiceAnswers";
import { useIsMobile } from "../../../lib/useIsMobile";
import { CardShell, FooterResult, useAutoNext } from "./shell";
import { useCardKeys } from "./hotkeys";
import { chunk, shuffle, stripTag, type VocabCardDef, type VocabCardProps } from "./types";

function MatchPairs({ items, onDone, review }: VocabCardProps) {
  const isMobile = useIsMobile();
  // A graded card is redrawn with the SAME right-column order and the learner's own links.
  const seen = review as { rights?: string[]; value?: string } | null | undefined;
  // Synthetic question for MatchingInput: left column = words (kept in order), right = shuffled meanings.
  const q = useMemo<PublicQuestion>(
    () => ({
      position: 0,
      type: "matching",
      question: "",
      lefts: items.map((it) => ({ text: stripTag(it.word) })),
      rights: (seen?.rights ?? shuffle(items.map((it) => it.meaning!))).map((text) => ({ text })),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items],
  );
  const [value, setValue] = useState(seen?.value ?? "");
  const [checked, setChecked] = useState(!!seen);
  const { pending, run } = useAutoNext();

  const assign = decodeMatching(value); // leftText(=từ) → rightText(=nghĩa)
  const allPaired = items.every((it) => assign[stripTag(it.word)]);
  // Chấm theo TỪ: cặp đúng khi nghĩa gán = nghĩa thật của từ.
  const resultOf = (it: (typeof items)[number]) => assign[stripTag(it.word)] === it.meaning;
  const pairResult: Record<string, boolean> = {};
  for (const it of items) pairResult[stripTag(it.word)] = resultOf(it);
  const nCorrect = items.filter(resultOf).length;

  const check = () => {
    if (checked || pending) return;
    setChecked(true);
    run(
      () => onDone(
        items.map((it) => ({ item: it, correct: resultOf(it) })),
        { rights: q.rights?.map((r) => r.text) ?? [], value },
      ),
      1400,
      { chime: nCorrect === items.length ? "right" : "wrong" },
    );
  };

  useCardKeys({ enter: () => { if (allPaired) check(); } }, !checked && !pending);

  return (
    <CardShell Icon={Link2} label="Match pairs" tone="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      hint="Tap a word, then its meaning"
      footer={!checked
        ? <Button size="lg" className="w-full" disabled={!allPaired} onClick={check}>Check</Button>
        : <FooterResult ok={nCorrect === items.length} answer={
            // Mobile bỏ tiền tố "Answer:" cho gọn; vẫn giữ "1/4 pairs correct".
            <><span className="hidden sm:inline">Answer: </span>{nCorrect}/{items.length} pairs correct</>
          } />}>
      <MatchingInput q={q} value={value} onChange={setValue} graded={checked} isMobile={isMobile} pairResult={checked ? pairResult : null} />
    </CardShell>
  );
}

export const def: VocabCardDef = {
  id: "matching", label: "Match pairs", hint: "Tap a word, then its meaning",
  Icon: Link2, tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  Component: MatchPairs,
  // Mỗi thẻ ghép tối đa 5 cặp; cần ≥2 cặp mới thành thẻ.
  build: (items) => chunk(shuffle(items.filter((i) => i.meaning)), 5).filter((g) => g.length >= 2),
};
