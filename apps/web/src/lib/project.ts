// Project facts shown in the teacher footer and the donate drawer.
export const APP_VERSION = __APP_VERSION__;
export const REPO_URL = "https://github.com/msyenglish/msy-homework";
/** While true the install guide asks for a read-only deploy key (API_DEPLOY); flip it when the repo goes public. */
export const REPO_PRIVATE = true;
/** The public site of the project: demo, install guide and about page. */
export const PROJECT_SITE = "https://free.msyen.com";
export const COPYRIGHT_HOLDER = "MSY English";
export const COPYRIGHT_URL = "https://msyen.com/vi/";

/** The maintainer's account for donations (VietQR). */
export const DONATE_BANK = {
  bin: "970422", // MB Bank
  label: "MB Bank",
  account: "1150115829999",
  name: "HOANG THI HAI YEN",
} as const;

/** VietQR image for a donation; the amount is left for the donor to type. */
export function donateQrUrl(memo: string): string {
  const params = new URLSearchParams({ addInfo: memo, accountName: DONATE_BANK.name });
  return `https://img.vietqr.io/image/${DONATE_BANK.bin}-${DONATE_BANK.account}-qr_only.png?${params}`;
}
