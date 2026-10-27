// Đo mức âm của 1 bản ghi (blob) để phát hiện "im lặng / mic lỗi" NGAY tại client trước khi
// nộp — giải mã PCM (decodeAudioData) rồi tính đỉnh (peak) + RMS. Trả null nếu không giải mã
// được (khi đó KHÔNG chặn nộp — để server lo). Lấy mẫu thưa cho nhanh với bài dài.
export async function measureAudioLevel(blob: Blob): Promise<{ peak: number; rms: number } | null> {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  const ac = new AC();
  try {
    const buf = await blob.arrayBuffer();
    const audio = await ac.decodeAudioData(buf);
    const data = audio.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / 200000)); // ~200k mẫu là đủ để đánh giá
    let peak = 0;
    let sumSq = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += step) {
      const v = data[i];
      const a = Math.abs(v);
      if (a > peak) peak = a;
      sumSq += v * v;
      n++;
    }
    return { peak, rms: n ? Math.sqrt(sumSq / n) : 0 };
  } catch {
    return null;
  } finally {
    ac.close().catch(() => {});
  }
}

// Bản ghi coi như KHÔNG CÓ TIẾNG (mic tắt/chặn/không thu được) khi cả đỉnh lẫn RMS đều rất
// thấp. Ngưỡng nới tay để KHÔNG chặn nhầm giọng đọc nhỏ (giọng thật RMS thường > 0.01).
export function isSilentLevel(lvl: { peak: number; rms: number }): boolean {
  return lvl.peak < 0.05 && lvl.rms < 0.006;
}
