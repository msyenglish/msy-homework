// ============================================================
//  Nền vùng chữ chạy — nhãn + ảnh. ID nằm ở `shared` (zod/D1); asset ảnh chỉ web
//  import được nên định nghĩa hình ảnh để ở đây. Ảnh dọc 9:16.
// ============================================================
import type { ReaderBg } from "@msyen/shared";
import { t, type TKey } from "../i18n";

import beMatTron from "../assets/reader-bg/be-mat-tron.webp";
import beMatTronThumb from "../assets/reader-bg/be-mat-tron-thumb.webp";
import bienDem from "../assets/reader-bg/bien-dem.webp";
import bienDemThumb from "../assets/reader-bg/bien-dem-thumb.webp";
import chuTieu from "../assets/reader-bg/chu-tieu.webp";
import chuTieuThumb from "../assets/reader-bg/chu-tieu-thumb.webp";
import cuaSoMayBay from "../assets/reader-bg/cua-so-may-bay.webp";
import cuaSoMayBayThumb from "../assets/reader-bg/cua-so-may-bay-thumb.webp";
import gaTau from "../assets/reader-bg/ga-tau.webp";
import gaTauThumb from "../assets/reader-bg/ga-tau-thumb.webp";
import hanhTinh from "../assets/reader-bg/hanh-tinh.webp";
import hanhTinhThumb from "../assets/reader-bg/hanh-tinh-thumb.webp";
import hoaXanh from "../assets/reader-bg/hoa-xanh.webp";
import hoaXanhThumb from "../assets/reader-bg/hoa-xanh-thumb.webp";
import luaTrai from "../assets/reader-bg/lua-trai.webp";
import luaTraiThumb from "../assets/reader-bg/lua-trai-thumb.webp";
import meoDiHia from "../assets/reader-bg/meo-di-hia.webp";
import meoDiHiaThumb from "../assets/reader-bg/meo-di-hia-thumb.webp";
import meoTrang from "../assets/reader-bg/meo-trang.webp";
import meoTrangThumb from "../assets/reader-bg/meo-trang-thumb.webp";
import meoTuyet from "../assets/reader-bg/meo-tuyet.webp";
import meoTuyetThumb from "../assets/reader-bg/meo-tuyet-thumb.webp";
import robotNho from "../assets/reader-bg/robot-nho.webp";
import robotNhoThumb from "../assets/reader-bg/robot-nho-thumb.webp";
import vetSang from "../assets/reader-bg/vet-sang.webp";
import vetSangThumb from "../assets/reader-bg/vet-sang-thumb.webp";

export type BgTheme = {
  id: ReaderBg;
  label: string;
  hint?: string;
  /** Nền màu phẳng (phông chroma). `null` ở `auto` = giữ nền thẻ theo sáng/tối. */
  color?: string | null;
  /** Ảnh nền + thumbnail nhẹ cho ô chọn. */
  image?: string;
  thumb?: string;
  /** Ảnh/màu TỐI → chữ sáng; ngược lại chữ đậm. Đo bằng độ sáng trung bình của ảnh. */
  dark: boolean;
};

type BgThemeSource = Omit<BgTheme, "label" | "hint"> & { label: TKey; hint?: TKey };

function bgTheme({ label, hint, ...theme }: BgThemeSource): BgTheme {
  return Object.defineProperties(theme, {
    label: { enumerable: true, get: () => t(label) },
    hint: { enumerable: true, get: () => (hint ? t(hint) : undefined) },
  }) as BgTheme;
}

// Màu chữ + IPA theo nền sáng/tối. Đặt tuyệt đối để thắng dark mode.
export const BG_FG = {
  dark: { text: "#ffffff", ipa: "#a5f3fc" },
  light: { text: "#0f172a", ipa: "#0e7490" },
};

export const READER_BGS: Record<ReaderBg, BgTheme> = {
  auto: bgTheme({ id: "auto", label: "lib.readerBg.auto", color: null, dark: false }),
  green: bgTheme({ id: "green", label: "lib.readerBg.green", hint: "lib.readerBg.chromaHint", color: "#00b140", dark: true }),
  blue: bgTheme({ id: "blue", label: "lib.readerBg.blue", hint: "lib.readerBg.chromaHint", color: "#0047bb", dark: true }),
  "meo-tuyet": bgTheme({ id: "meo-tuyet", label: "lib.readerBg.snowCat", image: meoTuyet, thumb: meoTuyetThumb, dark: true }),
  "hanh-tinh": bgTheme({ id: "hanh-tinh", label: "lib.readerBg.planets", image: hanhTinh, thumb: hanhTinhThumb, dark: true }),
  "meo-trang": bgTheme({ id: "meo-trang", label: "lib.readerBg.whiteCat", image: meoTrang, thumb: meoTrangThumb, dark: false }),
  "meo-di-hia": bgTheme({ id: "meo-di-hia", label: "lib.readerBg.pussInBoots", image: meoDiHia, thumb: meoDiHiaThumb, dark: true }),
  "be-mat-tron": bgTheme({ id: "be-mat-tron", label: "lib.readerBg.bigEyedChild", image: beMatTron, thumb: beMatTronThumb, dark: true }),
  "robot-nho": bgTheme({ id: "robot-nho", label: "lib.readerBg.littleRobot", image: robotNho, thumb: robotNhoThumb, dark: true }),
  "chu-tieu": bgTheme({ id: "chu-tieu", label: "lib.readerBg.noviceMonk", image: chuTieu, thumb: chuTieuThumb, dark: false }),
  "lua-trai": bgTheme({ id: "lua-trai", label: "lib.readerBg.nightCampfire", image: luaTrai, thumb: luaTraiThumb, dark: true }),
  "cua-so-may-bay": bgTheme({ id: "cua-so-may-bay", label: "lib.readerBg.airplaneWindow", image: cuaSoMayBay, thumb: cuaSoMayBayThumb, dark: true }),
  "ga-tau": bgTheme({ id: "ga-tau", label: "lib.readerBg.summerStation", image: gaTau, thumb: gaTauThumb, dark: true }),
  "vet-sang": bgTheme({ id: "vet-sang", label: "lib.readerBg.lightTrail", image: vetSang, thumb: vetSangThumb, dark: true }),
  "bien-dem": bgTheme({ id: "bien-dem", label: "lib.readerBg.nightSea", image: bienDem, thumb: bienDemThumb, dark: true }),
  "hoa-xanh": bgTheme({ id: "hoa-xanh", label: "lib.readerBg.blueFlower", image: hoaXanh, thumb: hoaXanhThumb, dark: true }),
};

export const READER_BG_LIST = Object.values(READER_BGS);

export function getReaderBg(id: ReaderBg): BgTheme {
  return READER_BGS[id] ?? READER_BGS.auto;
}

/** Nền `auto` giữ nguyên giao diện thẻ → không cần đổi màu chữ / không có lớp phủ. */
export function isPlainBg(bg: BgTheme) {
  return !bg.color && !bg.image;
}
