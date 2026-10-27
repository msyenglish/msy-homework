// Vòng đời một BUỔI LUYỆN từ vựng (vocab v2): bắt đầu · lưu tiến độ · học tiếp · kết thúc.
// Dùng chung cho mọi lối vào (chi tiết bộ từ, luyện nhanh ở trang Vocabulary) để chỉ có
// MỘT chỗ nói chuyện với API phiên.
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { VocabDeckConfig, VocabDeckResult, VocabItem, VocabSessionState } from "@msyen/shared";
import { accountApi, type VocabScope } from "../../../lib/api";
import { useLearningRefresh } from "../../../lib/learningRefresh";
import { buildSessionState } from "./registry";
import { createSessionSaver, type SessionSaver } from "./sessionSaver";

export interface ActiveSession {
  items: VocabItem[];
  config: VocabDeckConfig;
  initialState: VocabSessionState | null;
  sessionId: string | null;
}

/**
 * `scope`/`scopeKey` cố định (trang chi tiết bộ) hoặc do người học chọn ngay lúc bắt đầu
 * (luyện nhanh) — nên `start` nhận kèm nguồn thay vì chốt cứng lúc gọi hook.
 */
export function useVocabSession(watch: { scope: VocabScope; scopeKey?: string | null } | null) {
  const qc = useQueryClient();
  const refreshLearning = useLearningRefresh();
  const [session, setSession] = useState<ActiveSession | null>(null);
  const saver = useRef<{ id: string; s: SessionSaver } | null>(null);
  const saverFor = (id: string) => {
    if (saver.current?.id !== id) saver.current = { id, s: createSessionSaver(id) };
    return saver.current.s;
  };

  // Phiên đang dở của đúng nguồn đang xem (null = không theo dõi, ví dụ màn luyện nhanh).
  const { data: active } = useQuery({
    queryKey: ["vocab-active", watch?.scope ?? "none", watch?.scopeKey ?? null],
    queryFn: () => accountApi.vocabSessionActive(watch!.scope, watch?.scopeKey ?? null),
    enabled: !!watch,
  });
  const resume = active?.session ?? null;
  const invalidate = () => {
    if (watch) qc.invalidateQueries({ queryKey: ["vocab-active", watch.scope, watch.scopeKey ?? null] });
    // Every session reshuffles the review queue, so the "due" badge has to follow.
    qc.invalidateQueries({ queryKey: ["vocab-due"] });
    // Self-practice earns memory points too, so the XP badge and the library go stale with it.
    refreshLearning();
  };

  const start = async (
    items: VocabItem[],
    config: VocabDeckConfig,
    src: { scope: VocabScope; scopeKey?: string | null; label: string },
  ) => {
    const state = buildSessionState(items, config, true);
    let id: string | null = null;
    try {
      id = (
        await accountApi.vocabSessionStart({
          scope: src.scope,
          scopeKey: src.scopeKey ?? null,
          label: src.label,
          config,
          itemIds: items.map((i) => i.id),
          state,
        })
      ).id;
    } catch {
      /* lưu phiên hỏng thì vẫn học được, chỉ mất "học tiếp" */
    }
    setSession({ items, config, initialState: state, sessionId: id });
    invalidate();
  };

  const resumeSession = () => {
    if (resume) setSession({ items: resume.items, config: resume.config, initialState: resume.state, sessionId: resume.id });
  };
  const discardResume = async () => {
    if (resume) await accountApi.vocabSessionDelete(resume.id).catch(() => {});
    invalidate();
  };

  /** Các handler truyền thẳng cho <VocabDeckExercise>. */
  const deckHandlers = (onDone?: () => void) => ({
    onProgress: (state: VocabSessionState) => {
      if (session?.sessionId) saverFor(session.sessionId).save(state);
    },
    onSubmitResult: async (r: VocabDeckResult) => {
      const sid = session?.sessionId ?? null;
      if (sid) await saverFor(sid).flush();
      // The server closes the session itself on submit.
      await accountApi.vocabSubmit({ sessionId: sid, result: r });
      if (sid) saverFor(sid).close();
      invalidate();
      onDone?.();
    },
    onExit: () => {
      setSession(null);
      invalidate();
      onDone?.();
    },
  });

  return { session, start, resume, resumeSession, discardResume, deckHandlers };
}
