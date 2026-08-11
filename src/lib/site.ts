// Public, non-secret site-wide values used by the landing/legal pages.
// Safe to expose to the browser; override per environment via .env.local.

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://bot.jewelxtech.com";

// Official JewelX support address for privacy/terms/data-deletion requests;
// override per environment via NEXT_PUBLIC_SUPPORT_EMAIL if needed.
export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "hr@jewelxtech.com";
