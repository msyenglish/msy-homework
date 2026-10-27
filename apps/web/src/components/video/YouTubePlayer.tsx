// Player YouTube nhúng CHÍNH THỨC (IFrame API) — phát theo TỪNG ĐOẠN [start,end].
// KHÔNG tải video về; chỉ điều khiển player chính thức (seek + play + tự dừng cuối đoạn).
// Dùng chung cho trình soạn (xem thử) và trang luyện.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { Play } from "lucide-react";
import { t } from "../../i18n";

// Định dạng giây → m:ss
function fmt(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

export interface YouTubePlayerHandle {
  /** Phát đúng đoạn [start,end] (giây) rồi tự dừng ở cuối đoạn. */
  playSegment: (start: number, end: number) => void;
  /** Phát LIỀN MẠCH từ mốc `start`, không dừng ở cuối đoạn (chế độ xem). */
  playFrom: (start: number) => void;
  /** Mốc thời gian hiện tại của video (giây) — để bên ngoài tự bám câu. */
  getTime: () => number;
  pause: () => void;
  stop: () => void;
  setVolume: (v: number) => void; // 0..100
  setPlaybackRate: (r: number) => void; // 0.25..2 (YouTube hỗ trợ vài mức)
}

/** How far off the playhead may sit and still count as "already there" (seconds). */
const RESUME_TOLERANCE = 0.35;

interface Props {
  videoId: string;
  className?: string;
  onReady?: () => void;
  /** Tối giản chrome YouTube: ẩn thanh điều khiển/phím tắt/fullscreen/annotation + chặn tương tác trực tiếp.
   *  Ta tự lái phát/dừng qua API → kiểm soát hoàn toàn (học sinh không tua/mở YouTube được). */
  minimal?: boolean;
  /** Khi minimal: click lên mặt video sẽ gọi hàm này (vd phát lại đoạn hiện tại). */
  onSurfaceClick?: () => void;
  /** Khi minimal & chưa phát: nội dung lớp che (mặc định là nút Play lớn). Truyền để BỎ nút Play
   *  (vd trang có nút phát riêng, tránh trùng 2 nút). Lớp che vẫn giấu chrome pause của YouTube. */
  cover?: ReactNode;
  /** Crop harder at the BOTTOM to push burned-in subtitles out of frame. */
  cropSubs?: boolean;
}

// Nạp script IFrame API 1 lần cho cả app (trả promise resolve khi window.YT sẵn sàng).
let ytReady: Promise<void> | null = null;
export function loadYT(): Promise<void> {
  if (ytReady) return ytReady;
  ytReady = new Promise<void>((resolve) => {
    const w = window as unknown as { YT?: { Player: unknown }; onYouTubeIframeAPIReady?: () => void };
    if (w.YT && w.YT.Player) return resolve();
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (!document.getElementById("yt-iframe-api")) {
      const tag = document.createElement("script");
      tag.id = "yt-iframe-api";
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
  });
  return ytReady;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const YouTubePlayer = forwardRef<YouTubePlayerHandle, Props>(({ videoId, className = "", onReady, minimal = false, onSurfaceClick, cover, cropSubs = false }, ref) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const stopAtRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);
  const segRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 }); // đoạn đang phát (cho thanh thời gian)
  const pendingRef = useRef<{ start: number; end: number } | null>(null); // đoạn được yêu cầu KHI player CHƯA sẵn sàng → phát khi onReady
  const wantPlayRef = useRef(false); // TA đang muốn phát? → nếu YouTube tự dừng/cued (sau seek/pause) thì ép phát lại (khỏi bấm lần 2)
  const volRef = useRef(100); // âm lượng/tốc độ mong muốn → áp lại khi onReady (nếu set trước lúc player sẵn sàng)
  const rateRef = useRef(1);
  const armedRef = useRef(false); // đã "vào đoạn" (currentTime tụt về sau seek) chưa → mới cho phép dừng ở cuối đoạn
  const [active, setActive] = useState(false); // đang phát đoạn? (ẩn lớp che khi phát)
  const [cur, setCur] = useState(0); // thời gian đã trôi trong đoạn (giây)

  useEffect(() => {
    let disposed = false;
    loadYT().then(() => {
      if (disposed || !hostRef.current) return;
      const YT = (window as any).YT;
      playerRef.current = new YT.Player(hostRef.current, {
        videoId,
        // `origin` khớp origin trang → bớt cảnh báo postMessage của widget YouTube.
        // minimal → ẩn tối đa chrome YouTube (controls/keyboard/fullscreen/annotation/captions).
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin,
          ...(minimal ? { controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, cc_load_policy: 0 } : {}),
        },
        events: {
          onReady: () => {
            onReady?.();
            try { playerRef.current?.setVolume?.(volRef.current); playerRef.current?.setPlaybackRate?.(rateRef.current); } catch { /* ignore */ }
            // Có đoạn đã được bấm khi player còn đang tải → phát ngay (tránh phải bấm lần 2).
            const pend = pendingRef.current;
            if (pend) {
              pendingRef.current = null;
              segFnRef.current(pend.start, pend.end);
            }
          },
          // Ta muốn phát nhưng YouTube báo PAUSED(2)/CUED(5) (thường do seekTo ngay sau pause cuối đoạn)
          // → ép playVideo lần nữa để bấm 1 phát là chạy. Khi đã PLAYING(1) thì không đụng gì.
          onStateChange: (e: { data: number }) => {
            if (wantPlayRef.current && (e.data === 2 || e.data === 5)) {
              playerRef.current?.playVideo?.();
            }
          },
        },
      });
    });
    return () => {
      disposed = true;
      if (tickRef.current) cancelAnimationFrame(tickRef.current);
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // Vòng lặp theo dõi currentTime → cập nhật thanh thời gian + dừng khi chạm cuối đoạn.
  const tick = () => {
    const p = playerRef.current;
    const stopAt = stopAtRef.current;
    if (p && typeof p.getCurrentTime === "function") {
      const t = p.getCurrentTime();
      setCur(Math.max(0, t - segRef.current.start));
      // seekTo là BẤT ĐỒNG BỘ: vài frame đầu currentTime còn kẹt ở cuối đoạn trước.
      // Chỉ "arm" (cho phép dừng cuối đoạn) khi currentTime đã thực sự vào đoạn → tránh dừng NGAY (Replay khỏi bấm 2 lần).
      if (!armedRef.current) {
        if (stopAt == null || t < stopAt - 0.25) armedRef.current = true;
      } else if (stopAt != null && t >= stopAt) {
        wantPlayRef.current = false; // dừng CHỦ ĐỘNG ở cuối đoạn → onStateChange không ép phát lại
        p.pauseVideo();
        stopAtRef.current = null;
        tickRef.current = null;
        setActive(false); // hết đoạn → hiện lại lớp che (ẩn chrome pause của YouTube)
        return;
      }
    }
    tickRef.current = requestAnimationFrame(tick);
  };

  // Phát đoạn [start,end]. Player chưa sẵn sàng → nhớ lại (pending) để onReady phát (bấm 1 lần là chạy).
  const startSegment = (start: number, end: number) => {
    const p = playerRef.current;
    if (!p || typeof p.seekTo !== "function") {
      pendingRef.current = { start, end };
      return;
    }
    segRef.current = { start, end: end > start ? end : start };
    stopAtRef.current = end > start ? end : null;
    setCur(0);
    setActive(true);
    wantPlayRef.current = true; // đánh dấu MUỐN phát → onStateChange ép phát nếu YouTube đứng lại
    // Seeking flushes YouTube's buffer, and the gap while it refills is audible. In auto shadowing
    // the playhead is ALREADY sitting exactly here — line N ended where line N+1 begins and we only
    // paused for the student to speak — so seeking there again turns a seamless resume into a
    // stutter on every single line. Resume in place when we are already close enough.
    const at = typeof p.getCurrentTime === "function" ? p.getCurrentTime() : NaN;
    const inPlace = Number.isFinite(at) && Math.abs(at - start) <= RESUME_TOLERANCE;
    armedRef.current = inPlace; // already inside the segment → the end-stop may arm immediately
    if (!inPlace) p.seekTo(start, true);
    p.playVideo();
    if (tickRef.current) cancelAnimationFrame(tickRef.current);
    tickRef.current = requestAnimationFrame(tick);
  };
  // Con trỏ tới bản mới nhất của startSegment cho onReady (đặt 1 lần) gọi đúng closure.
  const segFnRef = useRef(startSegment);
  segFnRef.current = startSegment;

  useImperativeHandle(ref, () => ({
    playSegment: (start, end) => startSegment(start, end),
    // end <= start → không đặt mốc dừng, video chạy tiếp qua câu sau (xem liền mạch).
    playFrom: (start) => startSegment(start, start),
    getTime: () => {
      const p = playerRef.current;
      return typeof p?.getCurrentTime === "function" ? p.getCurrentTime() : 0;
    },
    pause: () => {
      wantPlayRef.current = false;
      playerRef.current?.pauseVideo?.();
      setActive(false);
    },
    stop: () => {
      wantPlayRef.current = false;
      stopAtRef.current = null;
      if (tickRef.current) cancelAnimationFrame(tickRef.current);
      playerRef.current?.pauseVideo?.();
      setActive(false);
    },
    setVolume: (v) => { volRef.current = v; try { playerRef.current?.setVolume?.(v); } catch { /* ignore */ } },
    setPlaybackRate: (r) => { rateRef.current = r; try { playerRef.current?.setPlaybackRate?.(r); } catch { /* ignore */ } },
  }));

  // Thủ thuật "overscan": phóng iframe ~1.28x + căn giữa → dải TITLE (trên) và chrome (dưới/góc)
  // rơi ra ngoài vùng overflow-hidden nên bị cắt. Đổi lại: video bị zoom/cắt mép nhẹ.
  // Chỉ áp cho minimal (player mình tự lái phát/dừng). Dùng ! để thắng style inline YouTube đặt cho iframe.
  // `cropSubs`: shift the frame UP instead of centring it, so the bottom band — where burned-in
  // subtitles live — falls outside the box. 132% with only 6% cut off the top leaves 26% cut off
  // the bottom, past where any subtitle sits. Costs a tighter shot; worth it when the lesson IS
  // the transcription and a visible subtitle hands over the answer.
  const crop = !minimal
    ? ""
    : cropSubs
      ? "[&>iframe]:!absolute [&>iframe]:!left-[-16%] [&>iframe]:!top-[-6%] [&>iframe]:!h-[132%] [&>iframe]:!w-[132%] [&>iframe]:pointer-events-none"
      : "[&>iframe]:!absolute [&>iframe]:!left-[-14%] [&>iframe]:!top-[-14%] [&>iframe]:!h-[128%] [&>iframe]:!w-[128%] [&>iframe]:pointer-events-none";
  return (
    <div className={`relative aspect-video w-full overflow-hidden rounded-xl bg-black ${crop} ${className}`}>
      <div ref={hostRef} className="absolute inset-0 h-full w-full" />
      {minimal && (
        <>
          {/* Đang phát: lớp trong suốt chặn tương tác trực tiếp (tua/hover hiện chrome/mở link). Click = phát lại. */}
          {active ? (
            <button type="button" aria-label={t("userVideoProfile.youtube.replaySegment")} onClick={onSurfaceClick} className="absolute inset-0 z-10 cursor-pointer" />
          ) : (
            /* Không phát: lớp CHE → giấu chrome pause của YouTube ("More videos", related, logo, tiêu đề).
               Iframe YouTube khác origin → KHÔNG chèn CSS/JS vào trong được; chỉ có thể PHỦ ĐÈ.
               Có `cover` (trang tự lo hình nền) → che ĐẶC hẳn để related-video không lộ qua; mặc định che mờ + nút Play. */
            <button
              type="button"
              aria-label={t("userVideoProfile.youtube.playSegment")}
              onClick={onSurfaceClick}
              className={`absolute -inset-px z-10 flex items-center justify-center transition ${cover ? "bg-slate-950 hover:bg-slate-900" : "bg-slate-950/80 backdrop-blur-sm hover:bg-slate-950/70"}`}
            >
              {cover ?? (
                <span className="flex size-16 items-center justify-center rounded-full bg-white/95 text-slate-900 shadow-xl transition hover:scale-105">
                  <Play className="ml-0.5 size-7 fill-current" />
                </span>
              )}
            </button>
          )}
          {/* Thanh thời gian ĐOẠN (không phải cả video) */}
          {active && segRef.current.end > segRef.current.start && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6 text-xs font-medium tabular-nums text-white">
              <span>{fmt(cur)}</span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
                <div
                  className="h-full rounded-full bg-cyan-400 transition-[width] duration-100"
                  style={{ width: `${Math.min(100, (cur / (segRef.current.end - segRef.current.start)) * 100)}%` }}
                />
              </div>
              <span>{fmt(segRef.current.end - segRef.current.start)}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
});
YouTubePlayer.displayName = "YouTubePlayer";
export default YouTubePlayer;
