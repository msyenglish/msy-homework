// Detects a MULTI-SPEAKER dialogue in a script and builds the cast (speaker → voice) for
// multi-voice TTS. Shared by the automatic path (ttsJob on save) and the editor's audio button, so
// both produce the same audio.
//
// GIỚI TÍNH: mỗi nhãn vai NÊN kèm thẻ giới "(M)"/"(F)" (vd "Ben (M):", "Lin (F):") → chọn giọng
// ĐÚNG GIỚI. Không có thẻ → xoay pool xen kẽ (có thể lệch giới, chỉ là dự phòng).
import { DIALOGUE_VOICES_FEMALE, DIALOGUE_VOICES_MALE } from "@msyen/shared";

// Speaker label at the start of a line, capturing group 1 = the label. Allows the gender tag
// "(M)/(F)" and the per-line emotion tag "[worried]".
// The SQUARE brackets must be inside the character class: without them "A (M) [happy]:" stops being
// recognised as a speaker label, the speaker count drops below 2, and the whole dialogue silently
// falls back to a single voice.
const SPEAKER_LABEL_CAP = /^\s*([A-Za-z][\w .'()[\]-]{0,40}?):[ \t]+\S/;
// Emotion tag at the end of the label — stripped before building the cast, because cast keys must
// match the label WITHOUT the tag (the synthesiser strips it too before looking the speaker up).
const EMOTION_TAG = /\s*\[\s*[A-Za-z][\w -]{0,24}\s*\]\s*$/;
// Gender tag at the end of the label: "(M)" | "(F)" | "(male)" | "(female)".
const GENDER_TAG = /\((m|male|f|female)\)\s*$/i;

export interface DialogueSpeaker {
  label: string; // nhãn ĐẦY ĐỦ như trong script (gồm cả thẻ giới) — media khớp theo nhãn này
  gender: "male" | "female" | null;
}

/** Nhãn vai DUY NHẤT theo thứ tự xuất hiện (kèm giới nếu có). ≥2 phần tử = hội thoại nhiều vai. */
export function dialogueSpeakers(text: string): DialogueSpeaker[] {
  const seen = new Set<string>();
  const out: DialogueSpeaker[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = SPEAKER_LABEL_CAP.exec(line);
    if (!m) continue;
    const label = m[1].replace(EMOTION_TAG, "").trim();
    const key = label.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const g = GENDER_TAG.exec(label);
    const gender = g ? (/^m/i.test(g[1]) ? "male" : "female") : null;
    out.push({ label, gender });
  }
  return out;
}

// FALLBACK suy giới từ TÊN khi nhãn không có thẻ (M)/(F) — bao phủ tên quốc tế pipeline hay dùng
// + danh xưng (Mr/Ms/Mrs/Miss). Tên lưỡng tính (Sam, Alex, Jordan…) CỐ TÌNH bỏ để không đoán sai.
const FEMALE_NAMES = new Set([
  "emma", "grace", "sophie", "mia", "amy", "ava", "olivia", "emily", "sophia", "isabella",
  "charlotte", "lily", "chloe", "zoe", "ella", "anna", "hannah", "lucy", "ruby", "nora", "aria",
  "jenny", "kate", "sarah", "laura", "julia", "maria", "rose", "bella", "ivy", "mila", "sofia",
  "alice", "clara", "daisy", "eva", "freya", "holly", "jade", "layla", "maya", "nina", "poppy",
  "sara", "tara", "vera", "willa", "grace", "lucia", "elena", "diana",
]);
const MALE_NAMES = new Set([
  "jack", "daniel", "oliver", "noah", "leo", "tom", "ethan", "liam", "james", "ben", "max", "jake",
  "luke", "henry", "george", "harry", "oscar", "alfie", "freddie", "theo", "adam", "david",
  "michael", "john", "peter", "paul", "mark", "ryan", "nathan", "aaron", "andrew", "brian", "guy",
  "kevin", "chris", "eric", "felix", "gabriel", "hugo", "ian", "jacob", "kyle", "louis", "mason",
  "nick", "owen", "simon", "toby", "victor", "will", "zac", "tim", "carlos", "diego", "marco",
]);
/** Giới suy từ nhãn vai (danh xưng → tên riêng); null nếu không chắc. */
export function nameGender(label: string): "male" | "female" | null {
  const first = label.toLowerCase().replace(/\([^)]*\)/g, "").trim().split(/[\s.]+/)[0] || "";
  if (first === "mr") return "male";
  if (first === "ms" || first === "mrs" || first === "miss") return "female";
  if (FEMALE_NAMES.has(first)) return "female";
  if (MALE_NAMES.has(first)) return "male";
  return null;
}

/** speakers → cast {nhãn: {voice}} — chọn giọng ĐÚNG GIỚI, phân biệt trong cùng giới bằng xoay pool. */
/**
 * Cast for a dialogue. `rate` is the SSML speaking-rate multiplier and comes from the exercise level
 * — the synthesiser applies it per turn, so it must be attached to every cast entry.
 */
export function buildDialogueCast(
  speakers: DialogueSpeaker[],
  rate?: string,
  pools: { female: string[]; male: string[] } = { female: DIALOGUE_VOICES_FEMALE, male: DIALOGUE_VOICES_MALE },
): Record<string, { voice: string; rate?: string }> {
  // Unknown-gender speakers alternate female/male so two of them never share a voice.
  const mixed = pools.female.flatMap((f, i) => (pools.male[i] ? [f, pools.male[i]] : [f]));
  let fi = 0;
  let mi = 0;
  let ni = 0;
  const cast: Record<string, { voice: string; rate?: string }> = {};
  for (const s of speakers) {
    // Thẻ (M)/(F) ưu tiên; không có thì suy từ tên; vẫn không rõ → xoay pool xen kẽ (dự phòng cuối).
    const gender = s.gender ?? nameGender(s.label);
    let voice: string;
    if (gender === "female") voice = pools.female[fi++ % pools.female.length];
    else if (gender === "male") voice = pools.male[mi++ % pools.male.length];
    else voice = mixed[ni++ % mixed.length];
    cast[s.label] = rate ? { voice, rate } : { voice };
  }
  return cast;
}
