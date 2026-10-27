// Translation drill as its own page. Two entry shapes, mirroring GrammarDrillPage:
//   /u/grammar/translate            + navigation state { config }  — start a freshly drawn session
//   /u/grammar/translate/:draftId                                  — reopen an unfinished one
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Languages } from "lucide-react";
import type { GrammarTranslateItem, GrammarTranslateSessionInput, TranslateLevel } from "@msyen/shared";
import { accountApi } from "../../lib/api";
import { GrammarTranslateDrill } from "../../components/practice/GrammarTranslateDrill";
import UserTopNav from "../../components/UserTopNav";
import { DrillPageStatus } from "../../components/practice/DrillPageStatus";
import { t } from "../../i18n";

const BACK_TO = "/u/grammar";

export default function GrammarTranslatePage() {
  const { draftId } = useParams();
  const { state } = useLocation() as { state?: { config?: GrammarTranslateSessionInput } };
  const navigate = useNavigate();
  const qc = useQueryClient();
  // This page sits OUTSIDE UserLayout, so there is no outlet context to read.
  const { data: me } = useQuery({ queryKey: ["account", "me"], queryFn: accountApi.me, retry: false });
  const learnerName = me?.user?.name || t("userPages.topNav.you");

  const [items, setItems] = useState<GrammarTranslateItem[] | null>(null);
  const [level, setLevel] = useState<TranslateLevel>("easy");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [initialAnswers, setInitialAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  // StrictMode double-invokes effects in dev; without this the session is drawn twice, which
  // silently burns a second set of sentences from a bank of only 8 per point.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        if (draftId) {
          const d = await accountApi.grammarTranslateDraft(draftId);
          setItems(d.items);
          setSessionId(d.session_id);
          setLevel((d.level as TranslateLevel) ?? "easy");
          setInitialAnswers(d.answers ?? {});
        } else if (state?.config) {
          const s = await accountApi.grammarTranslateSession(state.config);
          setItems(s.items);
          setSessionId(s.session_id);
          setLevel(state.config.level);
          // Put the session in the URL so a reload reopens the SAME sentences: they already spent
          // their cooldown. `replace` keeps Back working.
          navigate(`/u/grammar/translate/${s.session_id}`, { replace: true });
        } else {
          navigate(BACK_TO, { replace: true });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : t("userPages.grammarDrill.openError"));
      }
    })();
  }, [draftId, state, navigate]);

  async function submit(answers: { item_id: string; answer: string }[]) {
    const res = await accountApi.grammarTranslateSubmit(answers, sessionId ?? undefined);
    qc.invalidateQueries({ queryKey: ["grammar-state"] });
    qc.invalidateQueries({ queryKey: ["grammar-translate-state"] });
    qc.invalidateQueries({ queryKey: ["grammar-drafts"] });
    qc.invalidateQueries({ queryKey: ["user-stats"] });
    return res;
  }

  // Stable identity: the drill fetches inside an effect keyed on this, so a new function each
  // render would re-request the sentence forever.
  const fetchAnswer = useCallback(
    async (itemId: string) => {
      if (!sessionId) return "";
      return (await accountApi.grammarTranslateAnswer(sessionId, itemId)).en;
    },
    [sessionId],
  );

  function autosave(answers: Record<string, string>) {
    if (!sessionId) return;
    const kept: Record<string, string> = {};
    for (const [id, v] of Object.entries(answers)) if ((v ?? "").trim()) kept[id] = v;
    void accountApi.grammarDraftSave(sessionId, kept).catch(() => {});
  }

  if (error || !items) {
    return (
      <DrillPageStatus
        icon={<Languages className="size-7" />}
        title={t("userPages.grammarDrill.buildingSession")}
        hint={t("userPages.grammarDrill.buildingTranslateHint")}
        error={error}
        onBack={() => navigate(BACK_TO)}
      />
    );
  }

  return (
    // Shared user shell on top; the drill's own hero carries the exercise header underneath.
    <div className="min-h-screen bg-slate-100 pb-16 dark:bg-slate-950">
      <UserTopNav />
      <div className="pt-4 sm:pt-6" />
      <GrammarTranslateDrill
        key={sessionId ?? "new"}
        items={items}
        learnerName={learnerName}
        initialAnswers={initialAnswers}
        initialLevel={level}
        backTo={BACK_TO}
        fetchAnswer={fetchAnswer}
        onAnswersChange={autosave}
        onSubmit={submit}
      />
    </div>
  );
}
