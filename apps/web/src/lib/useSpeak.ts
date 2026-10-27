// Plays TTS pronunciation (cached in R2). URLs are cached per text for the session so a replay makes
// no API call. Errors are swallowed — a failed playback must not block learning.
// Reads a WORD by default (vocabSpeak); pass another fetcher for a SENTENCE (sentenceSpeak).
import { useCallback, useRef, useState } from "react";
import { accountApi } from "./api";
import { getVoiceGender, type VoiceKind } from "./voiceGender";

export function useSpeak(
  fetchUrl: (text: string, gender?: "male" | "female") => Promise<{ url: string }> = accountApi.vocabSpeak,
  kind: VoiceKind = "word", // "word" đọc từ (giọng từ) · "sentence" đọc câu (giọng câu)
) {
  const cache = useRef<Map<string, string>>(new Map());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [loading, setLoading] = useState<string | null>(null); // nội dung (lowercase) đang tải TTS

  const speak = useCallback(
    async (text: string) => {
      const label = text.trim().toLowerCase(); // dùng cho `loading` (component so với nội dung)
      if (!label) return;
      const gender = getVoiceGender(kind);
      const cacheKey = `${gender}|${label}`; // đổi giọng → phát bản mới, không lấy nhầm cache
      try {
        let url = cache.current.get(cacheKey);
        if (!url) {
          setLoading(label);
          url = (await fetchUrl(text, gender)).url;
          cache.current.set(cacheKey, url);
        }
        audioRef.current?.pause();
        const a = new Audio(url);
        audioRef.current = a;
        await a.play().catch(() => {});
      } catch {
        /* im lặng */
      } finally {
        setLoading(null);
      }
    },
    [fetchUrl, kind],
  );

  return { speak, loading };
}
