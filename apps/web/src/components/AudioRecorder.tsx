import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Lock, Mic, Settings2, Square } from "lucide-react";
import { cn } from "../lib/utils";
import { Select } from "./ui";
import { t } from "../i18n";

// Ghi âm bằng MediaRecorder (webm/opus trên Chrome/Android; mp4/aac trên iOS Safari).
// getUserMedia chỉ chạy trên HTTPS (hoặc localhost). Có giới hạn thời lượng.
type Status = "idle" | "recording" | "done";

// Số cột trong waveform cuộn khi đang ghi (mới nhất ở bên phải).
const WAVE_LEN = 56;

function pickMime(): string {
  const cands = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  const supported = (m: string) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m);
  return cands.find(supported) ?? "";
}

/**
 * Ghi âm KHÔNG giao diện, độ dài cố định — dùng cho chế độ shadowing tự động (máy tự bấm ghi).
 * Trả null nếu không lấy được dữ liệu. Dùng chung mime + micro đã chọn với recorder có giao diện.
 */
export async function recordFixedClip(ms: number): Promise<Blob | null> {
  const deviceId = localStorage.getItem("recDeviceId") || "";
  const stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true });
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<Blob | null>((resolve) => {
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resolve(chunks.length ? new Blob(chunks, { type: mime || "audio/webm" }) : null);
    };
  });
  rec.start();
  await new Promise((r) => setTimeout(r, ms));
  if (rec.state !== "inactive") rec.stop();
  return done;
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

export function AudioRecorder({
  maxSeconds = 90,
  disabled,
  onRecorded,
  onRecordingChange,
  autoStart,
  hint = t("shared.audioRecorder.hint"),
  recordLabel = t("shared.audioRecorder.recordLabel"),
  errorText,
  compact,
  hotkey,
}: {
  maxSeconds?: number;
  /** Single key (lower-case) that starts and stops the recording. Ignored while typing. */
  hotkey?: string;
  disabled?: boolean;
  /** Smaller mic and tighter spacing — for the back of a vocabulary card, where a full-size
   *  recorder made the card taller than its front and the grid jumped on every flip. */
  compact?: boolean;
  /** Opens the mic as soon as the recorder mounts — for a flow where the tap that got here WAS the
   *  "start" gesture, so asking for a second tap only adds friction. */
  autoStart?: boolean;
  onRecorded: (blob: Blob | null) => void;
  // Nhãn chính nút ghi (mặc định tiếng Việt; khu tiếng Anh truyền lại).
  recordLabel?: string;
  // Dòng gợi ý dưới "Bấm để ghi âm" — bài NÓI cần lời nhắc khác bài ĐỌC TO.
  hint?: string;
  // Lỗi từ CHA (vd nộp bài hỏng): thay chỗ dòng gợi ý bằng chữ đỏ ngắn — em đang nhìn đúng
  // vào cụm micro nên báo ngay tại đây, khỏi phải trông chờ em kịp thấy badge ở đỉnh trang.
  errorText?: string;
  // Báo trạng thái ĐANG ghi lên cha (để teleprompter tự chạy khi bắt đầu ghi).
  onRecordingChange?: (recording: boolean) => void;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  // Biên độ micro 0..1 → điều khiển "sóng xung kích" quanh icon.
  const [amp, setAmp] = useState(0);
  // Lịch sử biên độ (cuộn) → waveform dạng thanh khi đang ghi.
  const [wave, setWave] = useState<number[]>([]);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const elapsedRef = useRef(0);
  // Web Audio để đo biên độ micro theo thời gian thực.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | undefined>(undefined);
  // Gom đỉnh mỗi vài frame để waveform cuộn vừa mắt.
  const peaksRef = useRef<number[]>([]);
  const frameRef = useRef(0);
  const peakRef = useRef(0);

  // ── Micro: quyền + chọn thiết bị + kiểm tra nhanh mức âm ──
  type Perm = "unknown" | "prompt" | "granted" | "denied";
  const [micPerm, setMicPerm] = useState<Perm>("unknown");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  // Mic đã chọn (nhớ theo máy). "" = để trình duyệt tự chọn mặc định.
  const [deviceId, setDeviceId] = useState<string>(() => localStorage.getItem("recDeviceId") || "");
  const [showMic, setShowMic] = useState(false);
  // Đang test mức âm? null = không test; số 0..1 = mức âm hiện tại.
  const [testAmp, setTestAmp] = useState<number | null>(null);
  const testStreamRef = useRef<MediaStream | null>(null);
  const testCtxRef = useRef<AudioContext | null>(null);
  const testRafRef = useRef<number | undefined>(undefined);

  // Liệt kê các micro (label chỉ có sau khi đã cấp quyền 1 lần trong phiên).
  async function refreshDevices() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list.filter((d) => d.kind === "audioinput"));
    } catch {
      /* bỏ qua */
    }
  }

  // Hỏi trạng thái quyền + danh sách mic khi mở trang. Firefox/Safari có thể không hỗ trợ
  // Permissions API cho "microphone" → giữ "unknown" (vẫn xin quyền được bằng nút Cho phép).
  useEffect(() => {
    let active = true;
    const perms = (navigator as unknown as { permissions?: { query?: (d: { name: PermissionName }) => Promise<PermissionStatus> } }).permissions;
    perms
      ?.query?.({ name: "microphone" as PermissionName })
      .then((st) => {
        if (!active) return;
        setMicPerm(st.state as Perm);
        st.onchange = () => setMicPerm(st.state as Perm);
      })
      .catch(() => {});
    refreshDevices();
    const onDev = () => refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", onDev);
    return () => {
      active = false;
      navigator.mediaDevices?.removeEventListener?.("devicechange", onDev);
    };
  }, []);

  // Dừng test mức âm + dọn stream/ctx của phần test.
  function stopTest() {
    if (testRafRef.current) cancelAnimationFrame(testRafRef.current);
    testRafRef.current = undefined;
    testStreamRef.current?.getTracks().forEach((t) => t.stop());
    testStreamRef.current = null;
    testCtxRef.current?.close().catch(() => {});
    testCtxRef.current = null;
    setTestAmp(null);
  }

  // Xin quyền micro (bật popup trình duyệt). Cấp xong → refresh label thiết bị.
  async function requestMic() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      setMicPerm("granted");
      setError("");
      await refreshDevices();
    } catch {
      setMicPerm("denied");
    }
  }

  // Bật/tắt test mức âm: mở stream mic đã chọn + đo biên độ để em thấy "vạch xanh" nhảy.
  async function toggleTest() {
    if (testAmp !== null) {
      stopTest();
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
      testStreamRef.current = s;
      setMicPerm("granted");
      setError("");
      await refreshDevices();
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      testCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(s);
      const an = ctx.createAnalyser();
      an.fftSize = 64;
      an.smoothingTimeConstant = 0.8;
      src.connect(an);
      const bins = new Uint8Array(an.frequencyBinCount);
      const tick = () => {
        an.getByteFrequencyData(bins);
        let sum = 0;
        for (let i = 0; i < bins.length; i++) sum += bins[i];
        setTestAmp(Math.min(1, sum / bins.length / 90));
        testRafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setMicPerm("denied");
      setTestAmp(null);
    }
  }

  // Đổi mic đã chọn (nhớ vào máy). Đang test thì mở lại stream mic mới ngay.
  function pickDevice(id: string) {
    setDeviceId(id);
    if (id) localStorage.setItem("recDeviceId", id);
    else localStorage.removeItem("recDeviceId");
    // Đang test → dừng để em bấm "Kiểm tra âm" lại với mic vừa chọn (tránh stream cũ).
    if (testAmp !== null) stopTest();
  }

  function cleanupStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = undefined;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = undefined;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setAmp(0);
    setWave([]);
    peaksRef.current = [];
    frameRef.current = 0;
    peakRef.current = 0;
  }

  // Dừng ghi + dọn dẹp (cả phần test mic) khi rời trang.
  useEffect(() => () => {
    cleanupStream();
    stopTest();
  }, []);

  // Báo trạng thái ghi lên cha mỗi khi đổi.
  useEffect(() => {
    onRecordingChange?.(status === "recording");
  }, [status, onRecordingChange]);

  // Auto start: on mount, and again whenever the parent re-arms it (autoStart turning true) while
  // the recorder sits idle. A denied permission still surfaces through the usual error UI.
  useEffect(() => {
    if (autoStart && !disabled && status === "idle") void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  // Push-to-talk key: same toggle as the on-screen button, so a drill can be done hands-on-keyboard.
  useEffect(() => {
    if (!hotkey) return;
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || t?.isContentEditable) return;
      if (e.key.toLowerCase() !== hotkey.toLowerCase()) return;
      e.preventDefault();
      if (status === "recording") stop();
      else if (status === "idle" && !disabled) void start();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotkey, status, disabled]);

  // Average mic amplitude (AnalyserNode) → updates `amp` and feeds the waveform.
  function startMeter(stream: MediaStream) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser); // KHÔNG nối tới loa (tránh hú)
    const bins = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(bins);
      let sum = 0;
      for (let i = 0; i < bins.length; i++) sum += bins[i];
      // Chuẩn hóa nhạy hơn để sóng bám rõ theo giọng đọc.
      const a = Math.min(1, sum / bins.length / 90);
      setAmp(a);
      // Gom đỉnh mỗi 3 frame rồi đẩy 1 cột mới vào waveform (cuộn phải→trái).
      peakRef.current = Math.max(peakRef.current, a);
      frameRef.current += 1;
      if (frameRef.current % 3 === 0) {
        const arr = peaksRef.current;
        arr.push(peakRef.current);
        if (arr.length > WAVE_LEN) arr.shift();
        peaksRef.current = arr;
        setWave([...arr]);
        peakRef.current = 0;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }

  async function start() {
    setError("");
    stopTest(); // đang test mức âm thì tắt trước khi ghi thật
    try {
      // Ràng buộc mic để Azure chấm chuẩn hơn: chuẩn hoá âm lượng (autoGain) + khử ồn/vọng
      // + mono. Dùng đúng mic đã chọn (deviceId) nếu có.
      // No forced sampleRate: MediaRecorder encodes Opus at 48kHz anyway, and browsers often refuse a
      // 16k constraint (dropping noise suppression and mono with it). Record at the native rate;
      // lib/wav.ts resamples to 16k before scoring.
      let degraded = false;
      const stream = await navigator.mediaDevices
        .getUserMedia({
          audio: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          } as MediaTrackConstraints,
        })
        .catch((err) => {
          // Fallback: mic ghi "thô" (có thể stereo, không khử ồn) → Azure chấm kém chuẩn hơn.
          // KHÔNG nuốt lỗi im lặng nữa: log để còn lần ra khi điểm chấm lệch bất thường.
          degraded = true;
          console.warn("[AudioRecorder] Mic rejected constraints; recording in raw mode:", err);
          return navigator.mediaDevices.getUserMedia({ audio: true });
        });
      streamRef.current = stream;
      // Chỉ log khi mic ghi ở CHẾ ĐỘ THÔ (degraded) — để lần ra khi điểm chấm lệch; ghi bình
      // thường thì im, khỏi rác console mỗi lượt ghi.
      if (degraded) {
        console.warn("[AudioRecorder] Mic (raw):", stream.getAudioTracks()[0]?.getSettings?.() ?? {});
      }
      setMicPerm("granted");
      const mime = pickMime();
      // Chốt bitrate thay vì phó mặc trình duyệt: mặc định của Chromium là OPUS_AUTO ≈ 49kbps
      // (mono 48kHz), mỗi trình duyệt lại một khác → chất lượng đầu vào lệch nhau giữa thiết bị.
      // 64kbps Opus mono giữ rõ phụ âm xát (/s/, /θ/, /ʃ/) mà Azure cần để chấm âm vị.
      const rec = new MediaRecorder(stream, {
        ...(mime ? { mimeType: mime } : {}),
        audioBitsPerSecond: 64_000,
      });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        cleanupStream();
        setStatus("done");
        onRecorded(blob.size ? blob : null);
      };
      rec.start();
      recRef.current = rec;
      elapsedRef.current = 0;
      setElapsed(0);
      setStatus("recording");
      startMeter(stream);
      timerRef.current = window.setInterval(() => {
        elapsedRef.current += 1;
        setElapsed(elapsedRef.current);
        if (elapsedRef.current >= maxSeconds) stop();
      }, 1000);
    } catch {
      setError(t("shared.audioRecorder.accessError"));
      setMicPerm("denied");
      setShowMic(true); // mở bảng hướng dẫn cấp quyền / đổi mic
      setStatus("idle");
    }
  }

  function stop() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = undefined;
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
  }

  const recording = status === "recording";

  // Ghi xong → ẨN hẳn khối icon TO (tránh vô ý chạm). Nghe lại + "Ghi lại" do trang
  // cha lo (nút Ghi lại nằm giữa Quay lại · Nộp bài). Bấm Ghi lại sẽ remount lại đây.
  if (status === "done") return null;

  // Waveform căn phải: đệm 0 phía trước cho đủ WAVE_LEN cột (mới nhất ở bên phải).
  const bars =
    wave.length >= WAVE_LEN
      ? wave.slice(-WAVE_LEN)
      : [...Array(WAVE_LEN - wave.length).fill(0), ...wave];

  return (
    <div className={cn("flex flex-col items-center", compact ? "gap-1.5 py-0.5" : "gap-3 py-2")}>
      {error && <p className="text-center text-sm text-red-600">{error}</p>}

      {recording ? (
        // ── ĐANG GHI: waveform + nút DỪNG NHỎ inline cùng đồng hồ (bỏ icon TO cho gọn) ──
        <>
          {/* Waveform cuộn real-time (thanh biên độ quanh đường giữa). */}
          <div className="relative flex h-14 w-full max-w-sm items-center gap-[2px] px-2">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-red-300/40 dark:bg-red-500/30"
            />
            {bars.map((v, i) => (
              <span
                key={i}
                className="relative z-10 min-h-[3px] w-full flex-1 rounded-full bg-red-500/80 dark:bg-red-400/90"
                style={{ height: `${Math.max(5, v * 100)}%` }}
              />
            ))}
          </div>

          {/* Nút DỪNG nhỏ + đồng hồ + gợi ý — INLINE một hàng. */}
          <div className="flex items-center gap-3">
            <div className="relative flex size-12 shrink-0 items-center justify-center">
              {/* Sóng xung kích nhẹ theo âm lượng quanh nút dừng. */}
              <span
                aria-hidden
                className="absolute inset-0 rounded-full bg-red-500/25 transition-transform duration-75 ease-out"
                style={{ transform: `scale(${1 + amp * 1.1})`, opacity: 0.2 + amp * 0.5 }}
              />
              <button
                type="button"
                onClick={stop}
                style={{ transform: `scale(${1 + amp * 0.06})` }}
                className="relative flex size-12 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/40 transition hover:bg-red-600"
                aria-label={t("shared.audioRecorder.stop")}
              >
                <Square className="size-5 fill-current" />
              </button>
            </div>
            <div className="text-left">
              <p className="font-mono text-lg tabular-nums text-slate-800 dark:text-slate-100">
                {fmt(elapsed)} <span className="text-sm text-slate-400">/ {fmt(maxSeconds)}</span>
              </p>
              <p className="text-xs text-slate-400">{t("shared.audioRecorder.stopHint")}</p>
            </div>
          </div>
        </>
      ) : (
        // ── CHƯA GHI: icon micro TO ở giữa + text + kiểm tra micro (như cũ) ──
        <>
          <div className={cn("relative flex items-center justify-center", compact ? "size-16" : "size-20")}>
            <button
              type="button"
              onClick={start}
              disabled={disabled}
              className={cn(
                "relative flex items-center justify-center rounded-full bg-cyan-500 text-white shadow-lg shadow-cyan-500/40 transition hover:bg-cyan-600 disabled:opacity-40",
                compact ? "size-16" : "size-20",
              )}
              aria-label={t("shared.audioRecorder.start")}
            >
              <Mic className={compact ? "size-6" : "size-8"} />
            </button>
          </div>

          <div className="text-center">
            <p className="text-xs font-normal text-slate-400 dark:text-slate-500">{recordLabel}</p>
            {errorText ? (
              <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{errorText}</p>
            ) : hint ? (
              <p className="text-xs text-slate-400">{hint}</p>
            ) : (
              <></>
            )}
            {/* Nút mở bảng kiểm tra / đổi micro (dòng gợi ý) — popover mở LÊN TRÊN. */}
            <div className={cn("relative mx-auto w-fit", compact ? "mt-0.5" : "mt-1.5")}>
              <button
                type="button"
                onClick={() => setShowMic((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-cyan-600 transition hover:bg-cyan-50 dark:text-cyan-400 dark:hover:bg-cyan-500/10"
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-2 rounded-full",
                    micPerm === "granted"
                      ? "bg-emerald-500"
                      : micPerm === "denied"
                        ? "bg-rose-500"
                        : "bg-amber-500",
                  )}
                />
                <Settings2 className="size-3.5" />
                {micPerm === "granted" ? t("shared.audioRecorder.checkChange") : micPerm === "denied" ? t("shared.audioRecorder.blockedFix") : t("shared.audioRecorder.check")}
              </button>

              {showMic && (
                <>
                  {/* Nền bấm ra ngoài để đóng. */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => {
                      stopTest();
                      setShowMic(false);
                    }}
                  />
                  <div className="absolute bottom-full left-1/2 z-50 mb-2 w-[min(24rem,calc(100vw-1.5rem))] -translate-x-1/2">
                    <MicPanel
                      micPerm={micPerm}
                      devices={devices}
                      deviceId={deviceId}
                      testAmp={testAmp}
                      onRequest={requestMic}
                      onPick={pickDevice}
                      onToggleTest={toggleTest}
                      onClose={() => {
                        stopTest();
                        setShowMic(false);
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Bảng cấu hình micro: hiện trạng thái quyền, hướng dẫn mở khóa khi bị chặn, chọn thiết bị
// mic (nhớ theo máy) và test nhanh mức âm (vạch xanh nhảy = mic đang thu tốt).
function MicPanel({
  micPerm,
  devices,
  deviceId,
  testAmp,
  onRequest,
  onPick,
  onToggleTest,
  onClose,
}: {
  micPerm: "unknown" | "prompt" | "granted" | "denied";
  devices: MediaDeviceInfo[];
  deviceId: string;
  testAmp: number | null;
  onRequest: () => void;
  onPick: (id: string) => void;
  onToggleTest: () => void;
  onClose: () => void;
}) {
  const testing = testAmp !== null;
  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xl dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-bold text-slate-700 dark:text-slate-200">
          <Mic className="size-4 text-cyan-500" /> Micro
        </p>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          {t("common.close")}
        </button>
      </div>

      {/* Trạng thái quyền */}
      {micPerm === "granted" ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <Check className="size-3.5" /> {t("shared.audioRecorder.ready")}
        </p>
      ) : micPerm === "denied" ? (
        <div className="flex items-start gap-1.5 rounded-lg bg-rose-50 p-2 text-xs text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {t("shared.audioRecorder.blockedBeforeLock")}{" "}
            <Lock className="inline size-3.5 align-[-2px]" aria-hidden /> {t("shared.audioRecorder.blockedAfterLock")}
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={onRequest}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600"
        >
          <Mic className="size-4" /> {t("shared.audioRecorder.allow")}
        </button>
      )}

      {/* Chọn thiết bị mic — dùng Select chuẩn hoá (drop-up tự động, đồng bộ tông cyan). */}
      {devices.length > 0 && (
        <div className="mt-3">
          <Select
            label={t("shared.audioRecorder.select")}
            value={deviceId}
            onChange={onPick}
            menuPortal
            options={[
              { value: "", label: t("shared.audioRecorder.systemDefault") },
              ...devices.map((d, i) => ({ value: d.deviceId, label: d.label || t("shared.audioRecorder.microphoneNumber", { n: i + 1 }) })),
            ]}
          />
        </div>
      )}

      {/* Test mức âm — vạch xanh nhảy theo giọng nói */}
      <div className="mt-3">
        <button
          type="button"
          onClick={onToggleTest}
          className={cn(
            "flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition",
            testing
              ? "border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-500/10 dark:text-rose-300"
              : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700",
          )}
        >
          {testing ? t("shared.audioRecorder.stopCheck") : t("shared.audioRecorder.testSound")}
        </button>
        {testing && (
          <div className="mt-2">
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-500 transition-[width] duration-75"
                style={{ width: `${Math.round((testAmp ?? 0) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {(testAmp ?? 0) > 0.06 ? t("shared.audioRecorder.goodSound") : t("shared.audioRecorder.testPrompt")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
