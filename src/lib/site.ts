// Public, non-secret site-wide values used by the landing/legal pages.
// Safe to expose to the browser; override per environment via .env.local.

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://bot.jewelxtech.com";

// Falls back to the address already in use for privacy/terms/data-deletion
// requests rather than inventing a new one; override in production via
// NEXT_PUBLIC_SUPPORT_EMAIL if a dedicated support alias is set up.
export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "singaporearun2003@gmail.com";
