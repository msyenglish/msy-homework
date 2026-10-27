// Every editable field of one vocabulary entry; used by the entry drawer and the "by hand" add mode.
import type { VocabItemInput } from "@msyen/shared";
import { Input, Select } from "../ui";
import { t } from "../../i18n";

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const CEFR_OPTIONS = [{ value: "", label: "—" }, ...CEFR_LEVELS.map((c) => ({ value: c, label: c }))];
const listText = (v?: string[] | null) => (v ?? []).join(", ");
const textList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function EntryFields({ row, onChange, autoFocus }: { row: VocabItemInput; onChange: (patch: Partial<VocabItemInput>) => void; autoFocus?: boolean }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input label={t("teacherVocab.form.word")} value={row.word} onChange={(e) => onChange({ word: e.target.value })} autoFocus={autoFocus} />
        <Input label={t("teacherVocab.form.meaningVi")} value={row.meaning ?? ""} onChange={(e) => onChange({ meaning: e.target.value })} />
      </div>
      <div className="grid grid-cols-[1fr_1.4fr_0.8fr] gap-2">
        <Input label={t("teacherVocab.field.partOfSpeech")} value={row.pos ?? ""} onChange={(e) => onChange({ pos: e.target.value })} placeholder="n, v, adj…" />
        <Input label={t("teacherVocab.form.ipaUs")} value={row.ipa ?? ""} onChange={(e) => onChange({ ipa: e.target.value })} className="font-ipa" />
        <Select label={t("teacherVocab.field.cefr")} value={row.cefr ?? ""} onChange={(v) => onChange({ cefr: (v || null) as VocabItemInput["cefr"] })} options={CEFR_OPTIONS} />
      </div>
      <Input label={t("teacherVocab.form.definitionEn")} value={row.definition ?? ""} onChange={(e) => onChange({ definition: e.target.value })} />
      <div className="grid gap-2 sm:grid-cols-2">
        <Input label={t("teacherVocab.form.exampleSentence")} value={row.example ?? ""} onChange={(e) => onChange({ example: e.target.value })} />
        <Input label={t("teacherVocab.form.exampleVi")} value={row.example_vi ?? ""} onChange={(e) => onChange({ example_vi: e.target.value })} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input label={t("teacherVocab.form.collocationsHint")} value={listText(row.collocations)} onChange={(e) => onChange({ collocations: textList(e.target.value) })} />
        <Input label={t("teacherVocab.form.family")} value={listText(row.family)} onChange={(e) => onChange({ family: textList(e.target.value) })} placeholder="beauty (n), beautifully (adv)" />
        <Input label={t("teacherVocab.form.synonyms")} value={listText(row.synonyms)} onChange={(e) => onChange({ synonyms: textList(e.target.value) })} />
        <Input label={t("teacherVocab.form.antonyms")} value={listText(row.antonyms)} onChange={(e) => onChange({ antonyms: textList(e.target.value) })} />
      </div>
      <Input label={t("teacherVocab.form.usageNotes")} value={row.note ?? ""} onChange={(e) => onChange({ note: e.target.value })} />
      <Input label={t("teacherVocab.form.imageUrl")} value={row.image ?? ""} onChange={(e) => onChange({ image: e.target.value })} />
    </div>
  );
}
