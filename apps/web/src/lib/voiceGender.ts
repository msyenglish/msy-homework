// Lựa chọn GIỌNG ĐỌC (nam/nữ) cho phần phát âm — đồng bộ theo TÀI KHOẢN, đệm bằng localStorage.
//  • localStorage = bộ đệm ĐỒNG BỘ (để useSpeak/useWordSpeaker đọc ngay, không async).
//  • Server (users.voice_gender / voice_gender_sentence) = nguồn sự thật: máy khác vẫn giữ giọng đã chọn.
// TÁCH 2 loại: đọc TỪ (mặc định nữ) vs đọc CÂU/đoạn dài (mặc định nam) — em chỉnh riêng ở trang hồ sơ.
import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { PublicUser, VoiceGender } from "@msyen/shared";
import { accountApi } from "./api";

export type VoiceKind = "word" | "sentence";

const KEYS: Record<VoiceKind, string> = {
  word: "msyen.voiceGender",
  sentence: "msyen.voiceGender.sentence",
};
// Mặc định khi chưa chọn: từ = nữ · câu = nam (khớp quy ước audio vocab).
const DEFAULTS: Record<VoiceKind, VoiceGender> = { word: "female", sentence: "male" };
// Field tương ứng trên hồ sơ/PublicUser.
const FIELDS: Record<VoiceKind, "voice_gender" | "voice_gender_sentence"> = {
  word: "voice_gender",
  sentence: "voice_gender_sentence",
};
const EVT = "voicegenderchange";

export function getVoiceGender(kind: VoiceKind = "word"): VoiceGender {
  try {
    const v = localStorage.getItem(KEYS[kind]);
    if (v === "male" || v === "female") return v;
  } catch {
    /* storage bị chặn → dùng mặc định */
  }
  return DEFAULTS[kind];
}

function writeLocal(kind: VoiceKind, g: VoiceGender): void {
  try {
    localStorage.setItem(KEYS[kind], g);
  } catch {
    /* bỏ qua nếu storage bị chặn */
  }
  window.dispatchEvent(new CustomEvent(EVT));
}

// Đồng bộ MỘT CHIỀU server → local (gọi khi tải hồ sơ). KHÔNG ghi ngược lên server (tránh vòng lặp).
export function adoptAccountVoiceGender(word?: string | null, sentence?: string | null): void {
  if ((word === "male" || word === "female") && word !== getVoiceGender("word")) writeLocal("word", word);
  if ((sentence === "male" || sentence === "female") && sentence !== getVoiceGender("sentence")) writeLocal("sentence", sentence);
}

/** Hook đọc + đổi giọng theo loại; đổi → lưu localStorage + tài khoản (nếu đã đăng nhập). Tự đồng bộ khi nơi khác đổi. */
export function useVoiceGender(kind: VoiceKind = "word"): [VoiceGender, (g: VoiceGender) => void] {
  const qc = useQueryClient();
  const [g, setG] = useState<VoiceGender>(() => getVoiceGender(kind));
  useEffect(() => {
    setG(getVoiceGender(kind));
    const h = () => setG(getVoiceGender(kind));
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, [kind]);

  const set = useCallback(
    (next: VoiceGender) => {
      writeLocal(kind, next);
      // Đã đăng nhập → lưu lên tài khoản (cập nhật lạc quan cache "me", lỗi thì nuốt im lặng).
      const me = qc.getQueryData<{ user: PublicUser }>(["account", "me"]);
      if (me?.user) {
        const field = FIELDS[kind];
        qc.setQueryData<{ user: PublicUser }>(["account", "me"], { user: { ...me.user, [field]: next } });
        accountApi.updateProfile({ [field]: next }).catch(() => {});
      }
    },
    [qc, kind],
  );

  return [g, set];
}
