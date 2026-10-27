// i18n-ignore-file: builds a Vietnamese prompt for an external AI chat, not UI text
import { skillLabel } from "@msyen/shared";
import type { Mistake } from "./api";

interface BuildArgs {
  studentId: string;
  studentName: string;
  month: string; // "2026-07"
  mistakes: Mistake[];
  teacherNote?: string;
}

// Tạo prompt để dán vào ChatGPT/Claude web — không tốn phí API.
export function buildReportPrompt({
  studentId,
  studentName,
  month,
  mistakes,
  teacherNote,
}: BuildArgs): string {
  const lines: string[] = [];
  lines.push(
    `Bạn là gia sư tiếng Anh. Hãy viết BÁO CÁO HỌC TẬP THÁNG ${month} cho học sinh "${studentName}" bằng tiếng Việt, giọng động viên, dành cho phụ huynh đọc.`,
  );
  lines.push("");
  lines.push("Yêu cầu báo cáo gồm:");
  lines.push("1. Nhận xét chung về tiến bộ và thái độ.");
  lines.push(
    "2. Phân nhóm các LỖI theo chủ điểm ngữ pháp/từ vựng (gom lỗi giống nhau).",
  );
  lines.push(
    "3. Với mỗi nhóm lỗi: giải thích ngắn gọn vì sao sai và cách sửa, kèm 1 ví dụ đúng.",
  );
  lines.push("4. Gợi ý 3–5 việc cần luyện tháng tới.");
  lines.push("");

  if (teacherNote?.trim()) {
    lines.push(`Ghi chú của giáo viên: ${teacherNote.trim()}`);
    lines.push("");
  }

  if (mistakes.length === 0) {
    lines.push(
      "Trong tháng học sinh không có câu sai nào được ghi nhận (hoặc chưa làm bài).",
    );
  } else {
    lines.push(
      `Danh sách ${mistakes.length} câu SAI trong tháng (câu hỏi — Trả lời — đáp án đúng):`,
    );
    const capped = mistakes.slice(0, 40);
    capped.forEach((m, i) => {
      const skill = m.skill ? `[${skillLabel(m.skill) || m.skill}] ` : "";
      lines.push(
        `${i + 1}. ${skill}${m.question.replace(/\s+/g, " ").trim()} → em: "${m.studentAnswer || "(bỏ trống)"}" | đúng: "${m.correctAnswer || ""}"`,
      );
    });
    if (mistakes.length > capped.length) {
      lines.push(
        `… và ${mistakes.length - capped.length} câu sai khác (đã lược bớt).`,
      );
    }
  }

  // Để import ngược lại vào hệ thống: yêu cầu AI kết thúc bằng 1 khối JSON.
  lines.push("");
  lines.push("---");
  lines.push(
    "QUAN TRỌNG: Sau khi viết xong báo cáo, KẾT THÚC câu trả lời bằng ĐÚNG MỘT khối JSON (bọc trong ```json ... ```), giữ NGUYÊN VĂN hai giá trị student_id và month bên dưới, đặt toàn văn báo cáo (tiếng Việt) vào trường report:",
  );
  lines.push("```json");
  lines.push(
    JSON.stringify(
      { student_id: studentId, month, report: "<toàn văn báo cáo ở trên>" },
      null,
      2,
    ),
  );
  lines.push("```");
  return lines.join("\n");
}
