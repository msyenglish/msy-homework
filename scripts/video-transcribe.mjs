// Transcribes YouTube videos for video lessons.
// The audio is pulled on THIS machine with yt-dlp (the Worker cannot download from YouTube), sent to
// the API, transcribed by Deepgram there and cached under the video id. In the lesson editor,
// "auto transcript" for that link then answers from the cache.
//
//   pnpm video:transcribe <youtube-url> [more urls…] [--from 1:30] [--to 12:00] [--api http://localhost:8795] [--lang en]
//
// --from / --to download and transcribe only that stretch (an hour-long talk is not paid for in full);
// the cues keep the full video's clock. Without them, a video over 30 minutes is refused (--force).
//
// Signs in as a teacher: TEACHER_EMAIL / TEACHER_PASSWORD (default: the local teacher@example.com).
// Needs yt-dlp (and ffmpeg) on PATH.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const k = args.indexOf(`--${name}`);
  if (k < 0) return fallback;
  const v = args[k + 1];
  args.splice(k, 2);
  return v;
};
const API = opt("api", process.env.API_URL || "http://localhost:8795").replace(/\/$/, "");
const LANG = opt("lang", "en");
const clock = (v) => (v ? v.split(":").reduce((a, p) => a * 60 + Number(p), 0) : 0);
const FROM = clock(opt("from", ""));
const TO = clock(opt("to", ""));
const FORCE = args.includes("--force");
if (Number.isNaN(FROM) || Number.isNaN(TO) || (TO && TO <= FROM)) {
  console.error("--from/--to không hợp lệ — ghi dạng 1:30 hoặc 1:02:05, và --to phải sau --from.");
  process.exit(1);
}
const urls = args.filter((a) => !a.startsWith("--"));
if (!urls.length) {
  console.error("Cách dùng: pnpm video:transcribe <link YouTube> [link khác…] [--api URL] [--lang en]");
  process.exit(1);
}

try {
  execFileSync("yt-dlp", ["--version"], { stdio: "ignore" });
} catch {
  console.error("Không tìm thấy yt-dlp — cài bằng `pipx install yt-dlp` (hoặc brew/winget) rồi chạy lại.");
  process.exit(1);
}

const login = await fetch(`${API}/api/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: process.env.TEACHER_EMAIL || "teacher@example.com",
    password: process.env.TEACHER_PASSWORD || "teacher123",
  }),
});
if (!login.ok) {
  console.error(`Đăng nhập giáo viên thất bại (${login.status}) — đặt TEACHER_EMAIL / TEACHER_PASSWORD.`);
  process.exit(1);
}
const cookie = (login.headers.getSetCookie?.() ?? [login.headers.get("set-cookie") ?? ""])
  .map((c) => c.split(";")[0])
  .join("; ");

let failed = 0;
for (const url of urls) {
  const dir = mkdtempSync(join(tmpdir(), "video-transcribe-"));
  try {
    process.stdout.write(`• ${url}\n`);
    const duration = Number(execFileSync("yt-dlp", ["--no-warnings", "--no-playlist", "--print", "duration", url], { encoding: "utf8" }).trim());
    if (!FROM && !TO && duration > 1800 && !FORCE) {
      throw new Error(`video dài ${Math.round(duration / 60)} phút — chọn đoạn bằng --from/--to (hoặc thêm --force)`);
    }
    process.stdout.write(`  tải audio${FROM || TO ? ` (${FROM}s → ${TO || "hết"})` : ""}… `);
    // The raw audio stream is fetched as is, then cut and squeezed locally: piping a network stream
    // through ffmpeg (`--download-sections`) crashes some ffmpeg builds. Only the cut is transcribed.
    execFileSync("yt-dlp", ["-q", "--no-warnings", "--no-playlist", "-f", "bestaudio", "-o", join(dir, "src.%(ext)s"), url], {
      stdio: ["ignore", "ignore", "inherit"],
    });
    const src = readdirSync(dir).find((f) => f.startsWith("src."));
    if (!src) throw new Error("yt-dlp không tải được audio");
    // Speech needs little bitrate: a 64 kbps mono mp3 keeps an hour-long video around 30 MB.
    execFileSync(
      "ffmpeg",
      ["-loglevel", "error", "-y", ...(FROM ? ["-ss", String(FROM)] : []), ...(TO ? ["-to", String(TO)] : []), "-i", join(dir, src), "-vn", "-ac", "1", "-b:a", "64k", join(dir, "audio.mp3")],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    const file = "audio.mp3";
    const bytes = readFileSync(join(dir, file));
    process.stdout.write(`${(bytes.length / 1048576).toFixed(1)} MB · phiên âm… `);

    const fd = new FormData();
    fd.append("audio", new Blob([bytes], { type: "audio/mpeg" }), file);
    fd.append("lang", LANG);
    fd.append("youtube_url", url);
    // The clip starts at --from: the API moves its cues onto the video's clock.
    if (FROM || TO) fd.append("offset", String(FROM));
    if (FROM) fd.append("start", String(FROM));
    if (TO) fd.append("end", String(TO));
    const res = await fetch(`${API}/api/v1/teacher/video/transcribe`, { method: "POST", headers: { cookie }, body: fd });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `API lỗi ${res.status}`);
    console.log(`xong · ${data.segments.length} câu`);
  } catch (e) {
    failed++;
    console.log(`lỗi: ${e.message}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
process.exit(failed ? 1 : 0);
