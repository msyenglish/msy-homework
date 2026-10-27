// Tài khoản user công khai: hero điểm + gói cước + hồ sơ + mật khẩu + lịch sử.
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Check, ChevronDown, Clock, Compass, History, KeyRound, Loader2, Save, ShieldOff, Trophy, Volume2, X } from "lucide-react";
import { formatPoints, skillLabel } from "@msyen/shared";
import type { PublicUser } from "@msyen/shared";
import { accountApi, libraryApi, publicLevels, publicTopics } from "../../lib/api";
import { Button, Card, Input, Select } from "../../components/ui";
import { confirmAsk } from "../../components/confirm";
import { Popover } from "../../components/ui/popover";
import { VoiceGenderToggle } from "../../components/ui/voice-gender-toggle";
import { SkillThumb } from "../../components/SkillThumb";
import { TopicChips } from "../../components/TopicChips";
import { HeroDecor } from "../../components/HeroDecor";
import { Avatar } from "../../components/Avatar";
import { LevelMedal } from "../../components/LevelMedal";
import { LevelDot } from "../../lib/levels";
import { BIRTH_YEAR_OPTS, GenderTabs, type Gender } from "../../lib/userFields";
import { AVATAR_SIZE, squareWebp } from "../../lib/imageResize";
import { cn } from "../../lib/utils";
import { fmtDateTime } from "../../lib/format";
import { usePublicUser } from "./UserLayout";
import { LEARNING_QUERY_OPTS } from "../../lib/learningRefresh";
import { useHistoryState } from "../../lib/navState";
import { t, type TKey } from "../../i18n";

// Giới hạn độ dài tên hiển thị (đủ cho họ tên VN dạng "Nguyễn Hoàng Minh Đăng").
const NAME_MAX = 24;

// Màu huy hiệu điểm theo tỉ lệ đúng.
function scoreTone(pct: number) {
  if (pct >= 80) return "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
  if (pct >= 50) return "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300";
  return "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300";
}

// Nhãn HOẠT ĐỘNG của một lượt — rõ hơn nhãn kỹ năng vì bài Nghe & Nói sinh 2 loại lượt
// (nghe-viết + shadowing) trên cùng một bài.
const KIND_KEYS: Record<string, TKey> = {
  quiz: "userVideoProfile.profile.kindQuiz",
  dictation: "userVideoProfile.profile.kindDictation",
  shadowing: "userVideoProfile.profile.kindShadowing",
  read_aloud: "userVideoProfile.profile.kindReadAloud",
  writing: "userVideoProfile.profile.kindWriting",
  vocab: "userVideoProfile.profile.kindVocab",
  grammar: "userVideoProfile.profile.kindGrammar",
  grammar_translate: "userVideoProfile.profile.kindGrammarTranslate",
};

export default function UserProfilePage() {
  const { user } = usePublicUser();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [name, setName] = useState(user.name ?? "");
  const [levelId, setLevelId] = useState(user.level_id ?? "");
  const [topics, setTopics] = useState<string[]>(user.topics ?? []);
  const [birthYear, setBirthYear] = useState(user.birth_year ? String(user.birth_year) : "");
  const [gender, setGender] = useState<Gender | "">((user.gender as Gender) ?? "");
  const [saved, setSaved] = useState(false);
  const [avatarErr, setAvatarErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [topicsSaved, setTopicsSaved] = useState(false); // báo "Đã lưu" thoáng qua khi đổi chủ đề

  // Set/change password (new password only — no old password prompt). Panel collapses for tidiness.
  // Both are view state, not URL-worthy — kept per history entry so Back from a save/upload
  // restores the same expanded section instead of collapsing it.
  const [pwOpen, setPwOpen] = useHistoryState("pwOpen", false);
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [pwSaved, setPwSaved] = useState(false);
  const [showAllHistory, setShowAllHistory] = useHistoryState("showAllHistory", false); // false: only the last 20 entries

  const { data: levels } = useQuery({ queryKey: ["public-levels"], queryFn: publicLevels, retry: false });
  const { data: topicsData } = useQuery({ queryKey: ["public-topics"], queryFn: publicTopics, retry: false });
  // Chỉ chọn theo chủ đề GỐC — chủ đề con làm danh sách dài mà không thêm ý nghĩa lọc.
  const parentTopics = useMemo(() => (topicsData?.items ?? []).filter((t) => !t.parent_id), [topicsData]);
  const { data: stats } = useQuery({ queryKey: ["user-stats"], queryFn: libraryApi.stats, ...LEARNING_QUERY_OPTS });

  // Label kèm số thứ tự "Level N ·" nên tự map; icon dùng LevelDot chung.
  const levelOptions = (levels?.items ?? []).map((l, i) => ({
    value: l.id,
    label: `Level ${i + 1} · ${l.name}`,
    icon: <LevelDot icon={l.icon} color={l.color} />,
  }));

  const save = useMutation({
    mutationFn: () =>
      accountApi.updateProfile({
        name: name.trim() || null,
        level_id: levelId || null,
        topics,
        birth_year: birthYear ? Number(birthYear) : null,
        gender: gender || null,
      }),
    onSuccess: async () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await qc.invalidateQueries({ queryKey: ["account", "me"] });
      await qc.invalidateQueries({ queryKey: ["library"] }); // đổi level → đổi danh sách bài
    },
  });

  // Đổi ảnh đại diện: nén ngay trên máy rồi tải lên, server ghi đè đúng 1 file mỗi user.
  const uploadAvatar = useMutation({
    mutationFn: async (file: File) => accountApi.uploadAvatar(await squareWebp(file)),
    onSuccess: async () => {
      setAvatarErr("");
      await qc.invalidateQueries({ queryKey: ["account", "me"] });
    },
    onError: () => setAvatarErr(t("userVideoProfile.profile.avatarUploadFailed")),
  });

  function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // cho phép chọn LẠI đúng file vừa rồi
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setAvatarErr(t("userVideoProfile.profile.avatarNotAnImage"));
      return;
    }
    setAvatarErr("");
    uploadAvatar.mutate(file);
  }

  // Chủ đề quan tâm LƯU NGAY khi bấm chip (không cần nút Lưu). PATCH từng phần nên
  // chỉ đụng cột topics, không ảnh hưởng tên/level đang sửa dở.
  const saveTopics = useMutation({
    mutationFn: (next: string[]) => accountApi.updateProfile({ topics: next }),
    onSuccess: async () => {
      setTopicsSaved(true);
      setTimeout(() => setTopicsSaved(false), 1800);
      await qc.invalidateQueries({ queryKey: ["account", "me"] });
      await qc.invalidateQueries({ queryKey: ["library"] }); // đổi chủ đề → đổi danh sách bài
    },
  });
  const onTopicsChange = (next: string[]) => {
    setTopics(next);
    saveTopics.mutate(next);
  };

  const setPassword = useMutation({
    mutationFn: () => accountApi.setPassword(newPass),
    onSuccess: async () => {
      setPwSaved(true);
      setNewPass("");
      setConfirmPass("");
      setTimeout(() => setPwSaved(false), 2500);
      await qc.invalidateQueries({ queryKey: ["account", "me"] });
    },
  });

  // Kills every session token at once (this device included) — used when the account may have
  // been left signed in somewhere else (borrowed phone/computer).
  const logoutAll = useMutation({
    mutationFn: () => accountApi.logoutAll(),
    onSuccess: () => {
      toast.success(t("userVideoProfile.profile.logoutAllSuccess"));
      qc.clear();
      navigate("/u/login", { replace: true });
    },
    onError: () => toast.error(t("userVideoProfile.profile.actionFailed")),
  });

  async function onLogoutAll() {
    const ok = await confirmAsk({
      title: t("userVideoProfile.profile.logoutAllConfirmTitle"),
      message: t("userVideoProfile.profile.logoutAllConfirmMessage"),
      confirmText: t("userVideoProfile.profile.logoutAllConfirmButton"),
      danger: true,
    });
    if (ok) logoutAll.mutate();
  }

  // Show the Save button only when something actually changed vs the saved profile. Normalize
  // null/"" to the same shape, or the button would show up on load even with no edits.
  const dirty =
    name.trim() !== (user.name ?? "").trim() ||
    levelId !== (user.level_id ?? "") ||
    birthYear !== (user.birth_year ? String(user.birth_year) : "") ||
    gender !== (user.gender ?? "");

  const pwMismatch = confirmPass.length > 0 && newPass !== confirmPass;
  const pwValid = newPass.length >= 6 && newPass === confirmPass;

  return (
    <div className="mx-auto flex w-full max-w-[800px] flex-col gap-5">
      {/* Ô chọn tệp DÙNG CHUNG cho avatar hero (PC) và khối trong Thông tin (mobile). */}
      <input ref={fileRef} type="file" accept="image/*" onChange={onPickAvatar} className="hidden" />
      {/* Hero — cùng phong cách trang Thư viện: avatar + điểm số + huy hiệu cấp độ */}
      <header className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        <HeroDecor seed="user-account" />
        <div className="relative flex min-w-0 items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploadAvatar.isPending}
            title={t("userVideoProfile.profile.changeAvatar")}
            aria-label={t("userVideoProfile.profile.changeAvatar")}
            className="group relative shrink-0 rounded-2xl"
          >
            <Avatar seed={user.id} src={user.avatar_url} size={64} className="!rounded-2xl" points={stats?.points} />
            <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/45 opacity-0 transition group-hover:opacity-100">
              <Camera className="size-5 text-white" />
            </span>
            {uploadAvatar.isPending && (
              <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/45">
                <Loader2 className="size-5 animate-spin text-white" />
              </span>
            )}
            {/* Chấm máy ảnh: gợi ý bấm được, vì hover không tồn tại trên cảm ứng. */}
            <span className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full bg-cyan-500 text-white shadow ring-2 ring-white dark:ring-slate-900">
              <Camera className="size-3" />
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-2xl font-extrabold text-slate-900 dark:text-white">{user.name || t("userVideoProfile.profile.defaultUserName")}</h1>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400">
                <Trophy className="size-4" /> {t("userVideoProfile.profile.points", { n: stats?.points ?? 0, formatted: formatPoints(stats?.points ?? 0) })}
              </span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{stats?.exercises_done ?? 0}</span> {t("userVideoProfile.profile.exercisesDone", { n: stats?.exercises_done ?? 0 })}
              </span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span>
                <span className="font-bold text-slate-700 dark:text-slate-200">{stats?.attempts ?? 0}</span> {t("userVideoProfile.profile.attempts", { n: stats?.attempts ?? 0 })}
              </span>
            </p>
          </div>

          {/* Huy hiệu cấp độ — vinh danh ở góc phải hero */}
          {user.level && <LevelMedal level={user.level} className="ml-auto hidden sm:flex" />}
        </div>

        {/* Mobile: huy hiệu xuống dòng cho đỡ chật */}
        {user.level && <LevelMedal level={user.level} className="relative mt-3 flex w-full sm:hidden" />}
      </header>

      {/* Hồ sơ */}
      <Card>
        <div className="flex flex-col gap-4 p-5">
          <h2 className="font-bold text-slate-800 dark:text-slate-100">{t("userVideoProfile.profile.infoSection")}</h2>

          {/* Ảnh đại diện — chỉ MOBILE; trên PC đổi ngay ở avatar của hero. */}
          <div className="flex flex-col items-center gap-2 sm:hidden">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadAvatar.isPending}
              aria-label={t("userVideoProfile.profile.changeAvatar")}
              className="relative"
            >
              <Avatar seed={user.id} src={user.avatar_url} size={128} className="!rounded-3xl" points={stats?.points} />
              {/* Dải tối CHỈ ở đáy ảnh — icon vẫn đọc được mà không phủ mờ cả khuôn mặt. */}
              <span className="absolute inset-x-0 bottom-0 flex h-10 items-center justify-center rounded-b-3xl bg-gradient-to-t from-black/65 via-black/40 to-transparent">
                {uploadAvatar.isPending ? (
                  <Loader2 className="size-5 animate-spin text-white" />
                ) : (
                  <Camera className="size-5 text-white drop-shadow" />
                )}
              </span>
            </button>
            <p className="text-center text-xs text-slate-400">
              {t("userVideoProfile.profile.avatarHint", { size: AVATAR_SIZE })}
            </p>
            {avatarErr && <p className="text-xs text-rose-500">{avatarErr}</p>}
          </div>

          {/* Hàng 1: Tên hiển thị · Email — chia đôi */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Input
                label={t("userVideoProfile.profile.displayNameLabel")}
                value={name}
                maxLength={NAME_MAX}
                onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
              />
              <p className="mt-1 text-right text-xs text-slate-400">
                {name.length}/{NAME_MAX}
              </p>
            </div>
            <EmailField user={user} />
          </div>

          {/* Hàng 2: Cấp độ · Năm sinh — chia đôi */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label={t("userVideoProfile.profile.levelLabel")}
              placeholder={t("userVideoProfile.profile.selectLevel")}
              value={levelId}
              onChange={setLevelId}
              options={levelOptions}
            />
            <Select
              label={t("userVideoProfile.profile.birthYearLabel")}
              placeholder={t("userVideoProfile.profile.selectBirthYear")}
              value={birthYear}
              onChange={setBirthYear}
              options={BIRTH_YEAR_OPTS}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{t("userVideoProfile.profile.genderLabel")}</label>
            <GenderTabs value={gender} onChange={setGender} />
          </div>

          {/* Nút Lưu dồn sang phải */}
          {(dirty || save.isPending || saved || save.isError) && (
            <div className="flex items-center justify-end gap-3">
              {save.isError && <span className="text-sm text-rose-600">{t("userVideoProfile.profile.saveFailed")}</span>}
              <Button onClick={() => save.mutate()} disabled={save.isPending || saved}>
                {save.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> {t("common.saving")}
                  </>
                ) : saved ? (
                  <>
                    <Check className="size-4" /> {t("common.saved")}
                  </>
                ) : (
                  <>
                    <Save className="size-4" /> {t("common.save")}
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Giọng đọc mẫu — chọn giọng nam/nữ RIÊNG cho đọc TỪ và đọc CÂU. Đổi là lưu ngay lên
          tài khoản + áp cho mọi nút Nghe (không đổi audio bài đã gen sẵn). */}
      <Card>
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-teal-500 text-white shadow-sm">
              <Volume2 className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-slate-800 dark:text-slate-100">{t("userVideoProfile.profile.voiceSection")}</h2>
              <p className="text-xs text-slate-500">
                {t("userVideoProfile.profile.voiceDesc")}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {/* Mỗi hàng: tiêu đề + mô tả (2 dòng) bên trái · switcher dồn phải, căn giữa trên–dưới. */}
            <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("userVideoProfile.profile.voiceWord")}</p>
                <p className="text-xs text-slate-500">{t("userVideoProfile.profile.voiceWordDesc")}</p>
              </div>
              <VoiceGenderToggle kind="word" className="shrink-0" />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("userVideoProfile.profile.voiceSentence")}</p>
                <p className="text-xs text-slate-500">{t("userVideoProfile.profile.voiceSentenceDesc")}</p>
              </div>
              <VoiceGenderToggle kind="sentence" className="shrink-0" />
            </div>
          </div>
        </div>
      </Card>

      {/* Chủ đề quan tâm — box RIÊNG, luôn mở, LƯU NGAY (không nút Lưu). Chip chưa chọn
          tô xám để khỏi hiểu nhầm đang chọn. Rỗng = hiện bài tất cả chủ đề. */}
      {parentTopics.length > 0 && (
        <Card>
          <div className="flex flex-col gap-4 p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-teal-500 text-white shadow-sm">
                <Compass className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-bold text-slate-800 dark:text-slate-100">{t("userVideoProfile.profile.topicsSection")}</h2>
                <p className="text-xs text-slate-500">
                  {topics.length
                    ? t("userVideoProfile.profile.topicsFiltering", { n: topics.length })
                    : t("userVideoProfile.profile.topicsAll")}{" "}
                  {t("userVideoProfile.profile.topicsClickToChange")}
                </p>
              </div>
              {/* Báo trạng thái lưu tức thì */}
              {saveTopics.isPending ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-slate-400">
                  <Loader2 className="size-3.5 animate-spin" /> {t("common.saving")}
                </span>
              ) : topicsSaved ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <Check className="size-3.5" /> {t("common.saved")}
                </span>
              ) : null}
            </div>

            <TopicChips mutedUnselected topics={parentTopics} selected={topics} onChange={onTopicsChange} />

            {topics.length > 0 && (
              <button
                type="button"
                onClick={() => onTopicsChange([])}
                className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-rose-600 dark:hover:text-rose-400"
              >
                <X className="size-3.5" /> {t("userVideoProfile.profile.clearAllTopics")}
              </button>
            )}
          </div>
        </Card>
      )}

      {/* Mật khẩu — section box gọn: thumb + tiêu đề + mô tả, nút mở panel bên phải.
          Bấm mới hiện ô nhập (đỡ chật trang). Google-only cũng đặt được để đăng nhập bằng email. */}
      <Card>
        <div className="p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-teal-500 text-white shadow-sm">
              <KeyRound className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-slate-800 dark:text-slate-100">
                {user.has_password ? t("userVideoProfile.profile.password") : t("userVideoProfile.profile.createPassword")}
              </h2>
              <p className="text-xs text-slate-500">
                {user.has_password
                  ? t("userVideoProfile.profile.passwordDescChange")
                  : t("userVideoProfile.profile.passwordDescCreate")}
              </p>
            </div>
            <Button
              variant={pwOpen ? "ghost" : "outline"}
              size="sm"
              className="shrink-0"
              onClick={() => setPwOpen((v) => !v)}
            >
              {pwOpen ? (
                <>
                  {t("common.close")} <ChevronDown className="size-4 rotate-180 transition" />
                </>
              ) : (
                <>
                  <KeyRound className="size-4" /> {user.has_password ? t("userVideoProfile.profile.changePassword") : t("userVideoProfile.profile.createPassword")}
                </>
              )}
            </Button>
          </div>

          {pwOpen && (
            <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
              {/* 3 phần tử inline: 2 ô nhập + nút gửi (xuống dòng khi hẹp) */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="sm:flex-1">
                  <Input
                    label={t("userVideoProfile.profile.newPasswordLabel")}
                    type="password"
                    autoComplete="new-password"
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    placeholder={t("userVideoProfile.profile.newPasswordPlaceholder")}
                  />
                </div>
                <div className="sm:flex-1">
                  <Input
                    label={t("userVideoProfile.profile.confirmPasswordLabel")}
                    type="password"
                    autoComplete="new-password"
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                    placeholder={t("userVideoProfile.profile.confirmPasswordPlaceholder")}
                  />
                </div>
                <Button
                  className="shrink-0 sm:h-11"
                  onClick={() => setPassword.mutate()}
                  disabled={!pwValid || setPassword.isPending}
                >
                  <KeyRound className="size-4" />
                  {setPassword.isPending ? t("common.saving") : user.has_password ? t("userVideoProfile.profile.changePassword") : t("userVideoProfile.profile.createPassword")}
                </Button>
              </div>
              {pwMismatch && <p className="text-sm text-rose-600">{t("userVideoProfile.profile.passwordMismatch")}</p>}
              {pwSaved && (
                <p className="flex items-center gap-1 text-sm font-semibold text-emerald-600">
                  {t("userVideoProfile.profile.passwordUpdated")} <Check className="size-4" aria-hidden />
                </p>
              )}
              {setPassword.isError && <p className="text-sm text-rose-600">{t("userVideoProfile.profile.passwordUpdateFailed")}</p>}
            </div>
          )}

          {/* Sign out everywhere — irreversible, must confirm before running. */}
          <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400">
              <ShieldOff className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-slate-800 dark:text-slate-100">{t("userVideoProfile.profile.logoutAllSection")}</h3>
              <p className="text-xs text-slate-500">
                {t("userVideoProfile.profile.logoutAllSectionDesc")}
              </p>
            </div>
            <Button variant="danger" size="sm" className="shrink-0" onClick={onLogoutAll} disabled={logoutAll.isPending}>
              {logoutAll.isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldOff className="size-4" />}
              {t("userVideoProfile.profile.logoutAllConfirmButton")}
            </Button>
          </div>
        </div>
      </Card>

      {/* History */}
      <Card>
        <div className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
              <History className="size-4" />
            </span>
            <h2 className="font-bold text-slate-800 dark:text-slate-100">{t("userVideoProfile.profile.historySection")}</h2>
            {!!stats?.history.length && (
              <span className="ml-auto text-xs font-semibold text-slate-400">
                {t("userVideoProfile.profile.recentAttempts", { n: stats.history.length })}
              </span>
            )}
          </div>
          {!stats?.history.length ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-300 dark:bg-slate-800 dark:text-slate-600">
                <History className="size-6" />
              </span>
              <p className="text-sm text-slate-400">{t("userVideoProfile.profile.noHistory")}</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {(showAllHistory ? stats.history : stats.history.slice(0, 20)).map((h, i) => {
                const pct = h.total > 0 ? Math.round((h.score / h.total) * 100) : 0;
                return (
                  <li
                    key={i}
                    className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-2.5 transition-colors hover:bg-slate-100/80 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:bg-slate-800/70"
                  >
                    <SkillThumb skill={h.skill} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{h.title}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                        <span>{KIND_KEYS[h.kind ?? "quiz"] ? t(KIND_KEYS[h.kind ?? "quiz"]) : (skillLabel(h.skill, true) ?? t("userVideoProfile.profile.kindOther"))}</span>
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <span className="tabular-nums">{fmtDateTime(h.submitted_at)}</span>
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <span className="tabular-nums">
                          {h.score}/{h.total}
                          {h.kind === "dictation" ? t("userVideoProfile.profile.unitSentences") : ""}
                        </span>
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 self-center rounded-full px-2.5 py-1 text-xs font-bold tabular-nums",
                        scoreTone(pct),
                      )}
                    >
                      {pct}%
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {/* Toggle: mặc định 20 lượt, bung hết (API trả tối đa 100). */}
          {stats && stats.history.length > 20 && (
            <button
              type="button"
              onClick={() => setShowAllHistory((v) => !v)}
              className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-600 transition hover:border-cyan-300 hover:text-cyan-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-cyan-700 dark:hover:text-cyan-400"
            >
              {showAllHistory ? (
                <>{t("userVideoProfile.profile.collapseHistory")} <ChevronDown className="size-4 rotate-180 transition" /></>
              ) : (
                <>{t("userVideoProfile.profile.expandHistory", { n: stats.history.length - 20 })} <ChevronDown className="size-4 transition" /></>
              )}
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}

// ---- Email: hiển thị + đổi (hiệu lực sau 2 ngày) + trạng thái đang chờ ----
function EmailField({ user }: { user: PublicUser }) {
  const qc = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => accountApi.cancelEmailChange(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["account", "me"] });
    },
  });

  // Đang chờ đổi (trong 2 ngày) — hiện email đích + hạn hiệu lực + nút hủy.
  if (user.pending_email) {
    return (
      <div>
        <Input label="Email" value={user.email} disabled />
        <div className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 p-2.5 dark:bg-amber-500/10">
          <Clock className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 flex-1 text-xs">
            <p className="text-amber-700 dark:text-amber-300">
              {t("userVideoProfile.profile.pendingEmailWillChange")} <b className="break-all">{user.pending_email}</b> {t("userVideoProfile.profile.pendingEmailAt")} <b>{fmtDateTime(user.pending_email_at)}</b>.
            </p>
            <button
              type="button"
              onClick={() => cancel.mutate()}
              disabled={cancel.isPending}
              className="mt-1 font-semibold text-rose-600 hover:underline disabled:opacity-60 dark:text-rose-400"
            >
              {cancel.isPending ? t("userVideoProfile.profile.cancellingEmail") : t("userVideoProfile.profile.cancelEmailChange")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // "Đổi" là text-button (không viền/nền) NẰM TRONG ô email, bên phải; bấm mở popover form.
  return (
    <Input
      label="Email"
      value={user.email}
      disabled
      className="pr-14"
      rightIcon={
        <Popover
          align="right"
          ariaLabel={t("userVideoProfile.profile.changeEmail")}
          triggerClassName="rounded-md px-1 text-xs font-semibold text-cyan-600 transition hover:text-cyan-700 dark:text-cyan-400 dark:hover:text-cyan-300"
          trigger={t("userVideoProfile.profile.changeEmailTrigger")}
          panelClassName="w-72 p-3"
        >
          {(close) => <EmailChangeForm user={user} close={close} />}
        </Popover>
      }
    />
  );
}

// Form đổi email trong popover — gọi close() sau khi gửi yêu cầu thành công.
function EmailChangeForm({ user, close }: { user: PublicUser; close: () => void }) {
  const qc = useQueryClient();
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  const request = useMutation({
    mutationFn: () => accountApi.requestEmailChange(newEmail.trim().toLowerCase(), user.has_password ? password : undefined),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["account", "me"] });
      close();
    },
    onError: (e: unknown) => setErr((e as Error)?.message || t("userVideoProfile.profile.emailRequestFailed")),
  });

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-slate-500">
        {t("userVideoProfile.profile.emailChangeNotice1")} <b>{t("userVideoProfile.profile.emailChangeNotice2")}</b> {t("userVideoProfile.profile.emailChangeNotice3")}
      </p>
      <Input
        label={t("userVideoProfile.profile.newEmailLabel")}
        type="email"
        value={newEmail}
        onChange={(e) => setNewEmail(e.target.value)}
        placeholder="ban@example.com"
      />
      {user.has_password && (
        <Input
          label={t("userVideoProfile.profile.currentPasswordLabel")}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("userVideoProfile.profile.currentPasswordPlaceholder")}
        />
      )}
      {err && <p className="text-xs text-rose-600">{err}</p>}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={close}>
          {t("common.cancel")}
        </Button>
        <Button
          size="sm"
          onClick={() => request.mutate()}
          disabled={request.isPending || !newEmail.trim() || (user.has_password && !password)}
        >
          {request.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" /> {t("userVideoProfile.profile.sending")}
            </>
          ) : (
            t("userVideoProfile.profile.sendRequest")
          )}
        </Button>
      </div>
    </div>
  );
}

