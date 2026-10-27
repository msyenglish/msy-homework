// Phần THÂN chi tiết của một điểm ngữ pháp (công thức · dấu hiệu · cách dùng · ví dụ · mẹo…).
// Tách khỏi GrammarView để sổ tay /u/grammar và phần ngữ pháp trong báo cáo/chữa bài
// dùng CHUNG một cách trình bày — sửa 1 nơi, đổi cả hai.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Volume2 } from "lucide-react";
import type { Grammar } from "@msyen/shared";
import { accountApi, publicGrammar } from "../lib/api";
import { useSpeak } from "../lib/useSpeak";
import { KIND_LABEL, KIND_TONE } from "../lib/cefr";
import { cn } from "../lib/utils";

/**
 * `linkTo` — cho phép bấm sang điểm ngữ pháp khác (sổ tay /u/grammar truyền vào).
 * KHÔNG truyền ở báo cáo công khai (/s/:id, phụ huynh xem, không đăng nhập được /u) →
 * khi đó vẫn hiện TIÊU ĐỀ thay vì slug, chỉ là không bấm được.
 */
export default function GrammarDetail({ g, linkTo }: { g: Grammar; linkTo?: (id: string) => string }) {
  // Danh sách gọn (đã cache, dùng chung queryKey với sổ tay/picker) chỉ để đổi id → tiêu đề:
  // data lưu `related`/`compare.with` là slug thô, hiện nguyên slug thì học sinh không đọc được.
  const { data } = useQuery({ queryKey: ["grammar"], queryFn: publicGrammar, staleTime: Infinity, retry: false });
  const titleById = useMemo(() => new Map((data?.items ?? []).map((i) => [i.id, i.title])), [data]);
  // Nghe câu ví dụ (TTS câu, cache R2). Chỉ chạy khi user đã đăng nhập (/u); báo cáo công khai
  // vẫn render nút nhưng bấm sẽ 401 rồi nuốt lỗi — chấp nhận được (không chặn việc học).
  const { speak, loading: speaking } = useSpeak(accountApi.sentenceSpeak, "sentence");

  return (
    <div className="space-y-3">
      {/* Công thức */}
      <Section label="Structure">
        <div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
          {g.forms.map((f, i) => (
            <div key={i}>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-400">
                  {f.label}
                </span>
                <code className="text-sm font-bold text-cyan-700 dark:text-cyan-300">{f.formula}</code>
              </div>
              {f.example && <p className="mt-0.5 pl-0.5 text-sm italic text-slate-500">{f.example}</p>}
            </div>
          ))}
        </div>
      </Section>

      {/* Dấu hiệu nhận biết */}
      {g.signals?.length ? (
        <Section label="Signal words">
          <div className="flex flex-wrap gap-1.5">
            {g.signals.map((s, i) => (
              <span key={i} className="rounded-md bg-cyan-50 px-2 py-0.5 text-xs font-semibold text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300">
                {s}
              </span>
            ))}
          </div>
        </Section>
      ) : null}

      {/* Cách dùng */}
      <Section label="Usage">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
          {g.usage.map((u, i) => (
            <li key={i}>{u}</li>
          ))}
        </ul>
      </Section>

      {/* Quy tắc chính tả */}
      {g.spelling?.length ? (
        <Section label="Spelling rules">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
            {g.spelling.map((s, i) => (
              <li key={i}><code>{s}</code></li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Ví dụ */}
      <Section label="Examples">
        <div className="flex flex-col gap-2">
          {g.examples.map((ex, i) => (
            <div key={i} className="rounded-xl border border-slate-100 p-2.5 dark:border-slate-800">
              <div className="flex items-center gap-2">
                {ex.kind && (
                  <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold", KIND_TONE[ex.kind] ?? "bg-slate-100 text-slate-500 dark:bg-slate-800")}>
                    {KIND_LABEL[ex.kind]}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  {/* Desktop: câu Anh → nghĩa Việt trên CÙNG một dòng cho đỡ cao.
                      Mobile: vẫn xuống dòng, không thì hai câu chen nhau chật. */}
                  <div className="sm:flex sm:items-baseline sm:gap-2">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{ex.en}</p>
                    <span aria-hidden className="hidden shrink-0 text-slate-300 sm:inline dark:text-slate-600">→</span>
                    <p className="mt-0.5 min-w-0 text-sm text-slate-500 sm:mt-0">{ex.vi}</p>
                  </div>
                  {ex.note && <p className="mt-0.5 text-xs italic text-slate-400">{ex.note}</p>}
                </div>
                {/* Nghe câu mẫu (TTS) — canh giữa theo chiều cao thẻ. */}
                <button
                  type="button"
                  onClick={() => speak(ex.en)}
                  aria-label="Listen to this sentence"
                  title="Listen to this sentence"
                  className="flex size-7 shrink-0 items-center justify-center self-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-cyan-50 hover:text-cyan-600 dark:border-slate-700 dark:hover:bg-cyan-500/15 dark:hover:text-cyan-300"
                >
                  {speaking === ex.en.trim().toLowerCase() ? <Loader2 className="size-3.5 animate-spin" /> : <Volume2 className="size-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Kho tra cứu (danh mục cụm/từ) — cho phrasal verbs, giới từ đi kèm, cấu tạo từ…
          Gom theo `group` nếu có; mỗi mục là cụm + nghĩa + (ví dụ có nút nghe). */}
      {g.bank?.length ? (
        <Section label="Common phrases">
          <div className="flex flex-col gap-3">
            {groupBank(g.bank).map(([group, items]) => (
              <div key={group || "_"}>
                {group && (
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-cyan-600 dark:text-cyan-400">{group}</p>
                )}
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {items.map((it, i) => (
                    <div key={i} className="rounded-xl border border-slate-100 p-2.5 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm">
                            <span className="font-bold text-slate-800 dark:text-slate-100">{it.term}</span>
                            <span className="text-slate-400"> — </span>
                            <span className="text-slate-600 dark:text-slate-300">{it.meaning}</span>
                          </p>
                          {it.example && <p className="mt-0.5 text-xs italic text-slate-400">{it.example}</p>}
                        </div>
                        {it.example && (
                          <button
                            type="button"
                            onClick={() => speak(it.example!)}
                            aria-label="Listen to example"
                            title="Listen to example"
                            className="flex size-7 shrink-0 items-center justify-center self-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-cyan-50 hover:text-cyan-600 dark:border-slate-700 dark:hover:bg-cyan-500/15 dark:hover:text-cyan-300"
                          >
                            {speaking === it.example.trim().toLowerCase() ? <Loader2 className="size-3.5 animate-spin" /> : <Volume2 className="size-3.5" />}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {/* Mẹo ghi nhớ */}
      {g.tips?.length ? (
        <div className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-3 dark:border-cyan-800/50 dark:bg-cyan-500/10">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-400">Memory tips</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-cyan-900 dark:text-cyan-200/90">
            {g.tips.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Phân biệt — `c.with` là id điểm khác (type ghi "id hoặc tên"): tra ra được thì hiện
          tiêu đề + link, không thì in nguyên văn (phòng khi ai đó soạn bằng tên tự do). */}
      {g.compare?.length ? (
        <Section label="Compare">
          <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
            {g.compare.map((c, i) => (
              <li key={i}>
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  ↔ <GrammarRef id={c.with} title={titleById.get(c.with)} linkTo={linkTo} />:
                </span>{" "}
                {c.note}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Điểm liên quan — để ôn trọn cụm (vd hiện tại đơn ↔ trạng từ tần suất). */}
      {g.related?.length ? (
        <Section label="See also">
          <div className="flex flex-wrap gap-1.5">
            {g.related.map((id) => (
              <GrammarRef key={id} id={id} title={titleById.get(id)} linkTo={linkTo} chip />
            ))}
          </div>
        </Section>
      ) : null}

      {/* Lỗi hay gặp */}
      {g.mistakes?.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-800/50 dark:bg-amber-500/10">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">Common mistakes</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800 dark:text-amber-200/90">
            {g.mistakes.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Tham chiếu tới một điểm ngữ pháp khác. Hiện TIÊU ĐỀ (không phải slug); có linkTo → thành
 * link điều hướng, không thì chỉ là text. `chip` = kiểu viên (dùng ở "Xem thêm").
 */
function GrammarRef({
  id,
  title,
  linkTo,
  chip,
}: {
  id: string;
  title?: string;
  linkTo?: (id: string) => string;
  chip?: boolean;
}) {
  const label = title ?? id;
  if (linkTo) {
    return (
      <Link
        to={linkTo(id)}
        className={
          chip
            ? "inline-flex rounded-full border border-cyan-200 bg-cyan-50/70 px-2.5 py-0.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-100 dark:border-cyan-800/60 dark:bg-cyan-500/10 dark:text-cyan-300 dark:hover:bg-cyan-500/20"
            : "text-cyan-700 underline decoration-cyan-300 decoration-dotted underline-offset-2 hover:decoration-solid dark:text-cyan-300"
        }
      >
        {label}
      </Link>
    );
  }
  return chip ? (
    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
      {label}
    </span>
  ) : (
    <span>{label}</span>
  );
}

/** Gom mục "kho" theo `group`, GIỮ thứ tự nhóm xuất hiện lần đầu (mục không nhóm → khoá ""). */
function groupBank(bank: NonNullable<Grammar["bank"]>): [string, NonNullable<Grammar["bank"]>][] {
  const order: string[] = [];
  const map = new Map<string, NonNullable<Grammar["bank"]>>();
  for (const it of bank) {
    const key = it.group ?? "";
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(it);
  }
  return order.map((k) => [k, map.get(k)!]);
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      {children}
    </div>
  );
}
