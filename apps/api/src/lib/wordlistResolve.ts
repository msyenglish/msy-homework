// Writing "Suggested vocabulary": the exercise's own wordlist, shaped as VocabItem[] so the page can
// show chips with a listen button.
import { normalizeWordForCompare, type VocabItem } from "@msyen/shared";

export function wordlistItems(
  wordlist: { word?: string | null; ipa?: string | null; meaning?: string | null; example?: string | null; pos?: string | null }[] | null,
): VocabItem[] | null {
  const seen = new Set<string>();
  const out: VocabItem[] = [];
  for (const w of wordlist ?? []) {
    const word = (w?.word ?? "").trim();
    const key = normalizeWordForCompare(word);
    if (!word || !key || seen.has(key)) continue;
    seen.add(key);
    out.push({ id: "", word, pos: w.pos ?? null, ipa: w.ipa ?? null, meaning: w.meaning ?? null, example: w.example ?? null, image: null });
  }
  return out.length ? out : null;
}
