// Grammar drill as its own PAGE, rendered by the same `Quiz` component the regular grammar
// exercises use. The drill is a quiz over sentences drawn from the bank, so it should look and
// behave exactly like one — single/all view, per-question navigation, the same answer inputs and
// the same correction screen.
//
// Two entry shapes:
//   /u/grammar/practice            + navigation state { config }  — start a freshly drawn drill
//   /u/grammar/practice/:draftId                                  — reopen an unfinished one
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import { DrillPageStatus } from "../../components/practice/DrillPageStatus";
import type { GrammarDrillItem, GrammarSessionInput, GrammarSessionResult } from "@msyen/shared";
import { accountApi, type GradeResp, type PublicExerciseResp, type PublicQuestionResp } from "../../lib/api";
import { Quiz } from "../../components/practice/Quiz";
import { t } from "../../i18n";

const BACK_TO = "/u/grammar";

/** Bank items -> the exercise shape `Quiz` expects. Positions are 1-based and stable. */
function toExercise(items: GrammarDrillItem[], title: string): PublicExerciseResp {
  return {
    exercise_id: "grammar-drill",
    title,
    skill: "grammar",
    passage: null,
    audio_url: null,
    wordlist: null,
    questions: items.map((it, i) => ({ ...it.question, position: i + 1 }) as PublicQuestionResp),
  };
}

export default function GrammarDrillPage() {
  const { draftId } = useParams();
  const { state } = useLocation() as { state?: { config?: GrammarSessionInput } };
  const navigate = useNavigate();
  const qc = useQueryClient();
  // This page sits OUTSIDE UserLayout (it needs the full width a quiz wants), so there is no
  // outlet context to read — `usePublicUser()` would return null here. Fetch the account the
  // same way UserPracticePage does.
  const { data: me } = useQuery({ queryKey: ["account", "me"], queryFn: accountApi.me, retry: false });
  const learnerName = me?.user?.name || t("userPages.topNav.you");

  const [items, setItems] = useState<GrammarDrillItem[] | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [initialAnswers, setInitialAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GrammarSessionResult | null>(null);
  // StrictMode double-invokes effects in dev; without this the drill is drawn (and a draft row
  // created) twice, which silently burns a second set of items from the bank.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        if (draftId) {
          const d = await accountApi.grammarDraft(draftId);
          setItems(d.items);
          setSessionId(d.session_id);
          setInitialAnswers(d.answers ?? {});
        } else if (state?.config) {
          const s = await accountApi.grammarSession(state.config);
          setItems(s.items);
          setSessionId(s.session_id);
          // Put the session in the URL so a reload reopens the SAME drill instead of dropping the
          // learner back to the handbook: the drawn items already spent their cooldown, and the
          // draft row exists, so /practice/:draftId can rebuild it. `replace` keeps Back working.
          navigate(`/u/grammar/practice/${s.session_id}`, { replace: true });
        } else {
          navigate(BACK_TO, { replace: true });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : t("userPages.grammarDrill.openError"));
      }
    })();
  }, [draftId, state, navigate]);

  const exercise = useMemo(
    () => (items ? toExercise(items, items.length ? t("userPages.grammarDrill.titleWithCount", { n: items.length }) : t("userPages.grammarDrill.title")) : null),
    [items],
  );

  // Quiz keys answers by POSITION; the API keys them by item id.
  const idAt = (position: number) => items?.[position - 1]?.id ?? "";

  async function grade(answers: Record<string, string>): Promise<GradeResp> {
    const payload = Object.entries(answers)
      .filter(([, v]) => (v ?? "").trim())
      .map(([pos, v]) => ({ item_id: idAt(Number(pos)), answer: v }))
      .filter((a) => a.item_id);
    const res = await accountApi.grammarDrillSubmit(payload, sessionId ?? undefined);
    navigate(`/u/grammar/report/${res.id}`, { replace: true });
    setResult(res);
    qc.invalidateQueries({ queryKey: ["grammar-state"] });
    qc.invalidateQueries({ queryKey: ["grammar-drafts"] });
    qc.invalidateQueries({ queryKey: ["user-stats"] });

    const byItem = new Map(res.verdicts.map((v) => [v.item_id, v]));
    const positions = items?.map((it, i) => ({ it, position: i + 1 })) ?? [];
    return {
      score: res.correct,
      total: res.total,
      details: positions
        .filter((p) => byItem.has(p.it.id))
        .map((p) => {
          const v = byItem.get(p.it.id)!;
          return { position: p.position, type: p.it.question.type, correct: v.correct, credit: v.credit };
        }),
      review: positions
        .filter((p) => byItem.has(p.it.id))
        .map((p) => ({ position: p.position, correctAnswer: byItem.get(p.it.id)!.correct_answer })),
      points: res.points,
    };
  }

  // Autosave: the draft row already exists, so persisting answers keeps a closed tab recoverable.
  function autosave(answers: Record<string, string>) {
    if (!sessionId || result) return;
    const byId: Record<string, string> = {};
    for (const [pos, v] of Object.entries(answers)) {
      const id = idAt(Number(pos));
      if (id && (v ?? "").trim()) byId[id] = v;
    }
    void accountApi.grammarDraftSave(sessionId, byId).catch(() => {});
  }

  if (error || !exercise) {
    return (
      <DrillPageStatus
        icon={<ListChecks className="size-7" />}
        title={t("userPages.grammarDrill.buildingSession")}
        hint={t("userPages.grammarDrill.buildingQuizHint")}
        error={error}
        onBack={() => navigate(BACK_TO)}
      />
    );
  }

  // Positions were assigned in draw order, so the draft's answers map straight back onto them.
  const draftAnswers: Record<string, string> = {};
  if (items) items.forEach((it, i) => { if (initialAnswers[it.id]) draftAnswers[String(i + 1)] = initialAnswers[it.id]; });

  return (
    // Same page padding as UserPracticePage — without it the hero sits flush against the top edge.
    <div className="min-h-screen bg-slate-100 px-3 pb-16 sm:px-4 sm:pt-6 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1200px]">
        <Quiz
          key={sessionId ?? "new"}
          exercise={exercise}
          learnerName={learnerName}
          draftKey={`grammar-drill:${sessionId ?? "new"}`}
          initialAnswers={draftAnswers}
          onAnswersChange={autosave}
          onGrade={grade}
          backTo={BACK_TO}
        />
      </div>
    </div>
  );
}
