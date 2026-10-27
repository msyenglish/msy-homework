// Lưu TẠM các bản ghi đọc-to của học sinh cho từng bài, ở localStorage (không lên server).
// Mục đích: nghe lại các lần thử trước ngay trên máy. Giữ tối đa MAX bản gần nhất.
export type RecordEntry = {
  id: string;
  at: number; // mốc thời gian (Date.now)
  dataUrl: string; // audio base64 (data:...) để phát lại
};

const MAX = 5;
const key = (exerciseId: string) => `msyen_record_hist_${exerciseId}`;

export function getRecordHistory(exerciseId: string): RecordEntry[] {
  try {
    const raw = localStorage.getItem(key(exerciseId));
    const list = raw ? (JSON.parse(raw) as RecordEntry[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// Thêm 1 bản ghi (blob → dataURL) vào đầu danh sách, cắt còn MAX. Trả về danh sách mới.
export async function addRecordHistory(exerciseId: string, blob: Blob): Promise<RecordEntry[]> {
  const dataUrl = await blobToDataUrl(blob);
  const entry: RecordEntry = { id: crypto.randomUUID(), at: Date.now(), dataUrl };
  const next = [entry, ...getRecordHistory(exerciseId)].slice(0, MAX);
  try {
    localStorage.setItem(key(exerciseId), JSON.stringify(next));
  } catch {
    // localStorage đầy → bỏ bớt bản cũ rồi thử lại 1 lần.
    try {
      localStorage.setItem(key(exerciseId), JSON.stringify(next.slice(0, 2)));
    } catch {
      /* bỏ qua */
    }
  }
  return getRecordHistory(exerciseId);
}

export function clearRecordHistory(exerciseId: string) {
  try {
    localStorage.removeItem(key(exerciseId));
  } catch {
    /* bỏ qua */
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
