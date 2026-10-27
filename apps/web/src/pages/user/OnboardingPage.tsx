// Onboarding cho USER CÔNG KHAI — dạng 2 bước:
//   Bước 1: Cấp độ (kèm gợi ý chọn đúng) + Năm sinh + Giới tính.
//   Bước 2: Chủ đề quan tâm (tùy chọn) — mặc định "Tất cả chủ đề" (khuyên dùng).
// Bắt buộc sau khi đăng ký/đăng nhập Google nếu chưa có cấp độ. Xong → /u/library.
import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ChevronDown, Layers, Sparkles } from "lucide-react";
import { accountApi, publicLevels, publicTopics } from "../../lib/api";
import ThemeToggle from "../../components/ThemeToggle";
import { Logo } from "../../components/Logo";
import { Button, Select } from "../../components/ui";
import { LevelDot } from "../../lib/levels";
import { TopicChips } from "../../components/TopicChips";
import { BIRTH_YEAR_OPTS, GenderTabs, type Gender } from "../../lib/userFields";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { cn } from "../../lib/utils";
import { t, type TKey } from "../../i18n";

const STEP_KEYS: readonly TKey[] = ["userPages.onboarding.stepAbout", "userPages.onboarding.stepTopics"] as const;

export default function OnboardingPage() {
  useDocumentTitle(t("userPages.onboarding.pageTitle"));
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: me, isLoading } = useQuery({ queryKey: ["account", "me"], queryFn: accountApi.me, retry: false });
  const { data: levels } = useQuery({ queryKey: ["public-levels"], queryFn: publicLevels, retry: false });
  const { data: topicsData } = useQuery({ queryKey: ["public-topics"], queryFn: publicTopics, retry: false });

  const [step, setStep] = useState(0); // 0 = Về bạn · 1 = Chủ đề
  const [levelId, setLevelId] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [birthYear, setBirthYear] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [showLevelHelp, setShowLevelHelp] = useState(false);
  const [topicsExpanded, setTopicsExpanded] = useState(false); // mặc định thu gọn (bước tùy chọn)

  const VISIBLE_TOPICS = 12; // chỉ khi > ngưỡng này mới cho thu gọn (danh sách dài)
  // Chỉ chọn theo chủ đề GỐC — chủ đề con làm danh sách dài mà không thêm ý nghĩa lọc
  // (giống UserProfilePage). API trả cây phẳng cả cha lẫn con.
  const parentTopics = useMemo(() => (topicsData?.items ?? []).filter((t) => !t.parent_id), [topicsData]);
  const hasTopics = parentTopics.length > 0;
  // "Tất cả chủ đề" = không chọn chủ đề cụ thể nào (rỗng = quan tâm tất cả).
  const allTopics = topics.length === 0;

  // Label kèm số thứ tự "Level N ·" nên tự map; icon dùng LevelDot chung.
  const levelOptions = useMemo(
    () =>
      (levels?.items ?? []).map((l, i) => ({
        value: l.id,
        label: `Level ${i + 1} · ${l.name}`,
        icon: <LevelDot icon={l.icon} color={l.color} />,
      })),
    [levels],
  );

  const save = useMutation({
    mutationFn: () =>
      accountApi.updateProfile({
        level_id: levelId || null,
        topics: topics.length ? topics : null,
        birth_year: birthYear ? Number(birthYear) : null,
        gender: gender || null,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["account", "me"] });
      await qc.invalidateQueries({ queryKey: ["library"] });
      navigate("/u/library", { replace: true });
    },
  });

  // Chưa đăng nhập → về login. Đã có cấp độ rồi → vào thẳng thư viện (không onboarding lại).
  if (!isLoading && !me?.user) return <Navigate to="/u/login" replace />;
  if (me?.user?.level_id) return <Navigate to="/u/library" replace />;

  // Bỏ qua bước chủ đề nếu chưa có chủ đề nào → lưu luôn ở bước 1.
  const isLastStep = step === 1 || !hasTopics;

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10 dark:bg-slate-950">
      <ThemeToggle className="absolute right-4 top-4" />
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo />
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t("userPages.onboarding.title")}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {t("userPages.onboarding.subtitle")}
            </p>
          </div>
        </div>

        {/* Thanh bước — chỉ hiện khi có bước chủ đề */}
        {hasTopics && (
          <div className="mb-6 flex items-center justify-center gap-3">
            {STEP_KEYS.map((stepKey, i) => {
              const label = t(stepKey);
              return (
                <div key={stepKey} className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition",
                        i <= step
                          ? "bg-cyan-500 text-white"
                          : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-semibold",
                        i <= step ? "text-slate-700 dark:text-slate-200" : "text-slate-400",
                      )}
                    >
                      {label}
                    </span>
                  </div>
                  {i < STEP_KEYS.length - 1 && (
                    <span className={cn("h-px w-10", i < step ? "bg-cyan-400" : "bg-slate-200 dark:bg-slate-700")} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ───────── Bước 1: Về bạn ───────── */}
        {step === 0 && (
          <div className="flex flex-col gap-5">
            <div>
              <Select
                label={t("userPages.onboarding.levelLabel")}
                placeholder={t("userPages.onboarding.levelPlaceholder")}
                value={levelId}
                onChange={setLevelId}
                options={levelOptions}
              />
              {/* Gợi ý chọn cấp độ — expand/collapse nhỏ, căn phải */}
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowLevelHelp((v) => !v)}
                  className="flex items-center gap-1 text-xs font-semibold text-cyan-600 transition hover:text-cyan-700 dark:text-cyan-400"
                >
                  <ChevronDown className={cn("size-3.5 transition-transform", showLevelHelp && "rotate-180")} />
                  {t("userPages.onboarding.levelHelpPrompt")}
                </button>
              </div>
              {showLevelHelp && (
                <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                  <ul className="space-y-1.5">
                    <li>
                      <b>{t("userPages.onboarding.levelHelp1Title")}</b>{t("userPages.onboarding.levelHelp1Desc")}
                    </li>
                    <li>
                      <b>{t("userPages.onboarding.levelHelp2Title")}</b>{t("userPages.onboarding.levelHelp2Desc")}
                    </li>
                    <li>
                      <b>{t("userPages.onboarding.levelHelp3Title")}</b>{t("userPages.onboarding.levelHelp3Desc")}
                    </li>
                    <li>{t("userPages.onboarding.levelHelpNote")}</li>
                  </ul>
                </div>
              )}
            </div>

            <Select
              label={t("userPages.onboarding.birthYearLabel")}
              placeholder={t("userPages.onboarding.birthYearPlaceholder")}
              value={birthYear}
              onChange={setBirthYear}
              options={BIRTH_YEAR_OPTS}
            />

            {/* Giới tính — tab icon */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{t("userPages.onboarding.genderLabel")}</label>
              <GenderTabs value={gender} onChange={setGender} />
            </div>
          </div>
        )}

        {/* ───────── Bước 2: Chủ đề ───────── */}
        {step === 1 && hasTopics && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-500">
              {t("userPages.onboarding.topicsSubtitle")}
            </p>

            {/* Tất cả chủ đề (khuyên dùng) — chọn nhanh, tương đương không lọc */}
            <button
              type="button"
              onClick={() => setTopics([])}
              className={cn(
                "flex items-center gap-3 rounded-2xl border p-3.5 text-left transition",
                allTopics
                  ? "border-cyan-400 bg-cyan-50 dark:border-cyan-500/50 dark:bg-cyan-500/10"
                  : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60",
              )}
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-xl",
                  allTopics ? "bg-cyan-500 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800",
                )}
              >
                <Layers className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                  {t("userPages.onboarding.allTopics")}
                  <span className="rounded-full bg-cyan-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300">
                    {t("userPages.onboarding.recommended")}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">{t("userPages.onboarding.allTopicsDesc")}</span>
              </span>
            </button>

            <div className="flex items-center gap-3 text-xs font-semibold uppercase text-slate-400">
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" /> {t("userPages.onboarding.orChooseSpecific")}{" "}
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-sm font-medium text-slate-700 dark:text-slate-300">
                <span>
                  {t("userPages.onboarding.topicsLabel")} <span className="font-normal text-slate-400">({t("common.optional")})</span>
                </span>
                {topics.length > 0 && (
                  <span className="text-xs font-semibold text-cyan-600 dark:text-cyan-400">{t("userPages.onboarding.selectedCount", { n: topics.length })}</span>
                )}
              </div>
              {/* Chip trực tiếp (không box cuộn) — chỉ hiện VISIBLE_TOPICS đầu, "Xem thêm" inline cuối hàng */}
              <TopicChips
                mutedUnselected
                topics={topicsExpanded ? parentTopics : parentTopics.slice(0, VISIBLE_TOPICS)}
                selected={topics}
                onChange={setTopics}
                trailing={
                  parentTopics.length > VISIBLE_TOPICS ? (
                    <button
                      type="button"
                      onClick={() => setTopicsExpanded((v) => !v)}
                      className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-[13px] font-semibold text-slate-500 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      {topicsExpanded ? t("userPages.onboarding.collapse") : t("userPages.onboarding.expandWithCount", { n: parentTopics.length - VISIBLE_TOPICS })}
                    </button>
                  ) : undefined
                }
              />
            </div>
          </div>
        )}

        {save.isError && <p className="mt-4 text-sm text-rose-600">{t("userPages.onboarding.saveError")}</p>}

        {/* ───────── Điều hướng bước ───────── */}
        <div className="mt-6 flex items-center gap-3">
          {step === 1 && (
            <Button variant="secondary" size="lg" onClick={() => setStep(0)}>
              <ArrowLeft className="size-4" /> {t("common.back")}
            </Button>
          )}
          {isLastStep ? (
            <Button size="lg" className="flex-1" disabled={!levelId || save.isPending} onClick={() => save.mutate()}>
              <Sparkles className="size-4" /> {save.isPending ? t("common.saving") : t("userPages.onboarding.startLearning")}
            </Button>
          ) : (
            <Button size="lg" className="flex-1" disabled={!levelId} onClick={() => setStep(1)}>
              {t("userPages.onboarding.continue")} <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
        <p className="mt-3 text-center text-xs text-slate-400">{t("userPages.onboarding.changeAnytime")}</p>
      </div>
    </div>
  );
}
