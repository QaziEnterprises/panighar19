/**
 * Lightweight re-exports for consuming settings across the app.
 * Import from here instead of useAppSettings when you don't need the hook.
 */
export { getAppSettings, formatCurrency, formatDate, formatDateTime } from "@/hooks/useAppSettings";
export type { AppSettings } from "@/hooks/useAppSettings";
