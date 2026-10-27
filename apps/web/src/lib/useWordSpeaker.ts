import { useCallback, useRef, useState } from "react";
import { publicApi } from "./api";
import { getVoiceGender } from "./voiceGender";

// One shared audio channel across every speaker on the page: starting a new clip (or an explicit
// stop) always halts the previous one, so a word and its example never play over each other.
let activeAudio: HTMLAudioElement | null = null;
let clearActive: (() => void) | null = null; // resets the owning component's `speaking` highlight

function stopActive() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }
  if (clearActive) {
    clearActive();
    clearActive = null;
  }
}

/** Stop whatever word/sentence audio is currently playing (e.g. when flipping a flashcard). */
export function stopWordAudio() {
  stopActive();
}

// Phát âm 1 TỪ theo yêu cầu (TTS on-demand, public /word/speak). Cache url theo từ để bấm
// lại không gọi lại API; chỉ 1 audio phát tại một thời điểm (singleton toàn trang).
//  • `loading` = từ đang TẢI url (network) → hiện SPINNER (chỉ lần đầu, chưa cache).
//  • `speaking` = từ đang PHÁT → highlight; hết phát tự xoá (KHÔNG để spinner kéo dài).
// Dùng cho: đoạn đọc (click từ khó) + tooltip kết quả.
export function useWordSpeaker() {
  const cache = useRef<Map<string, string>>(new Map());
  const [loading, setLoading] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState<string | null>(null);

  // `src` = URL audio PRE-GEN (đã dựng sẵn cả nam/nữ trong ngân hàng từ) → phát ngay, KHÔNG gọi
  // /word/speak (giảm trễ). Chỉ khi thiếu src mới rơi về TTS on-demand.
  // `until: "end"` resolves when the clip FINISHES, not when it starts — for a caller that has to
  // wait for the word to be heard before moving on (see the vocab deck's verdict flow).
  const play = useCallback(async (raw: string, opts?: { src?: string | null; until?: "start" | "end" }) => {
    const word = (raw || "").trim();
    if (!word) return;
    const key = word.toLowerCase(); // dùng cho loading/speaking (component so với nội dung)
    const gender = getVoiceGender();
    const cacheKey = `${gender}|${key}`; // đổi giọng → tải lại URL mới
    stopActive(); // dừng clip đang phát ở BẤT KỲ speaker nào (khỏi đọc đè)
    try {
      // Ưu tiên URL pre-gen; nếu không có thì lấy từ cache, cuối cùng mới gọi API.
      let url = opts?.src || cache.current.get(cacheKey);
      if (!url) {
        // Chỉ hiện spinner khi THỰC SỰ phải tải (chưa cache) — lần sau phát ngay, không spinner.
        setLoading(key);
        try {
          url = (await publicApi.wordSpeak(word, gender)).url;
          cache.current.set(cacheKey, url);
        } finally {
          setLoading((k) => (k === key ? null : k));
        }
      }
      setSpeaking(key);
      const a = new Audio(url);
      const clear = () => setSpeaking((s) => (s === key ? null : s));
      let ended: (() => void) | null = null;
      const done = () => {
        clear();
        if (activeAudio === a) { activeAudio = null; clearActive = null; }
        ended?.();
      };
      a.onended = done;
      a.onerror = done;
      activeAudio = a;
      clearActive = clear;
      const finished = opts?.until === "end"
        // Capped: a stalled clip must never leave the caller waiting forever.
        ? new Promise<void>((resolve) => { ended = resolve; setTimeout(resolve, 4000); })
        : null;
      await a.play().catch(done);
      if (finished) await finished;
    } catch {
      setLoading((k) => (k === key ? null : k));
      setSpeaking((s) => (s === key ? null : s));
    }
  }, []);

  return { play, loading, speaking };
}
