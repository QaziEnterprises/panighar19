import { useEffect, useCallback } from "react";

export interface AppSettings {
  // Business
  businessName: string;
  businessPhone: string;
  businessAddress: string;
  businessEmail: string;
  businessTagline: string;
  businessWebsite: string;
  businessLogo: string;
  businessRegistration: string;
  businessNTN: string;
  // Localization
  currency: string;
  currencySymbol: string;
  dateFormat: string;
  numberFormat: string;
  timezone: string;
  language: string;
  // POS
  defaultPaymentMethod: string;
  defaultPaymentStatus: string;
  posGridColumns: string;
  autoCreateCustomer: boolean;
  enableBarcode: boolean;
  soundOnSale: boolean;
  posQuickActions: boolean;
  posShowStock: boolean;
  posConfirmSale: boolean;
  // Invoice
  invoicePrefix: string;
  invoiceStartNumber: number;
  invoiceTerms: string;
  invoiceNotes: string;
  showSignatureLine: boolean;
  showTermsOnInvoice: boolean;
  // Tax
  taxEnabled: boolean;
  taxRate: number;
  taxLabel: string;
  taxRegistrationNo: string;
  taxInclusive: boolean;
  // Receipt
  receiptShowLogo: boolean;
  receiptFooterText: string;
  receiptShowTax: boolean;
  receiptShowBarcode: boolean;
  receiptPaperSize: string;
  receiptCopies: number;
  // WhatsApp
  enableWhatsApp: boolean;
  whatsAppDefault: string;
  whatsAppTemplate: string;
  // Alerts
  lowStockAlert: boolean;
  lowStockThreshold: number;
  emailAlerts: boolean;
  dailySummaryAlert: boolean;
  paymentDueAlert: boolean;
  expiryAlert: boolean;
  // Appearance
  theme: string;
  sidebarColor: string;
  accentColor: string;
  fontSize: string;
  compactMode: boolean;
  animationsEnabled: boolean;
  cursorStyle: string;
  // Backup
  autoBackup: boolean;
  backupFrequency: string;
  dataRetentionDays: number;
  // Printing
  printOnSave: boolean;
  defaultPrinter: string;
  printMargins: string;
  // Security
  sessionTimeout: number;
  requirePasswordChange: boolean;
  twoFactorEnabled: boolean;
  loginAttemptLimit: number;
  ipWhitelist: string;
  // Users
  enableMultiUser: boolean;
  defaultUserRole: string;
  allowSelfRegistration: boolean;
  // Advanced
  enableAPI: boolean;
  debugMode: boolean;
  cacheEnabled: boolean;
  exportFormat: string;
  decimalPlaces: number;
  roundingMethod: string;
  negativeSalesAllowed: boolean;
  editAfterSave: boolean;
  deleteRequiresPassword: boolean;
}

const defaultSettings: AppSettings = {
  businessName: "Qazi Enterprises",
  businessPhone: "",
  businessAddress: "",
  businessEmail: "",
  businessTagline: "Your trusted business partner",
  businessWebsite: "",
  businessLogo: "",
  businessRegistration: "",
  businessNTN: "",
  currency: "PKR",
  currencySymbol: "Rs",
  dateFormat: "dd/MM/yyyy",
  numberFormat: "en-PK",
  timezone: "Asia/Karachi",
  language: "en",
  defaultPaymentMethod: "cash",
  defaultPaymentStatus: "paid",
  posGridColumns: "4",
  autoCreateCustomer: true,
  enableBarcode: true,
  soundOnSale: true,
  posQuickActions: true,
  posShowStock: true,
  posConfirmSale: true,
  invoicePrefix: "QE-",
  invoiceStartNumber: 1001,
  invoiceTerms: "Payment is due within 30 days of invoice date.",
  invoiceNotes: "",
  showSignatureLine: true,
  showTermsOnInvoice: true,
  taxEnabled: false,
  taxRate: 0,
  taxLabel: "GST",
  taxRegistrationNo: "",
  taxInclusive: false,
  receiptShowLogo: true,
  receiptFooterText: "Thank you for your business!",
  receiptShowTax: false,
  receiptShowBarcode: true,
  receiptPaperSize: "80mm",
  receiptCopies: 1,
  enableWhatsApp: true,
  whatsAppDefault: "",
  whatsAppTemplate: "Dear {customer}, your invoice #{invoice} of Rs {total} is ready. Thank you!",
  lowStockAlert: true,
  lowStockThreshold: 10,
  emailAlerts: false,
  dailySummaryAlert: false,
  paymentDueAlert: true,
  expiryAlert: false,
  theme: "system",
  sidebarColor: "dark",
  accentColor: "amber",
  fontSize: "normal",
  compactMode: false,
  animationsEnabled: true,
  cursorStyle: "neon-glow",
  autoBackup: false,
  backupFrequency: "daily",
  dataRetentionDays: 365,
  printOnSave: false,
  defaultPrinter: "default",
  printMargins: "normal",
  sessionTimeout: 30,
  requirePasswordChange: false,
  twoFactorEnabled: false,
  loginAttemptLimit: 5,
  ipWhitelist: "",
  enableMultiUser: true,
  defaultUserRole: "user",
  allowSelfRegistration: false,
  enableAPI: false,
  debugMode: false,
  cacheEnabled: true,
  exportFormat: "xlsx",
  decimalPlaces: 2,
  roundingMethod: "round",
  negativeSalesAllowed: false,
  editAfterSave: true,
  deleteRequiresPassword: false,
};

/** Read full settings from localStorage, merged with defaults */
export function getAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem("app_settings");
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : { ...defaultSettings };
  } catch {
    return { ...defaultSettings };
  }
}

// ── Accent color palettes (HSL values) ──
const accentPalettes: Record<string, { main: string; foreground: string }> = {
  amber:  { main: "38 92% 50%",  foreground: "0 0% 100%" },
  blue:   { main: "217 91% 60%", foreground: "0 0% 100%" },
  green:  { main: "142 71% 45%", foreground: "0 0% 100%" },
  red:    { main: "0 72% 51%",   foreground: "0 0% 100%" },
  purple: { main: "270 60% 55%", foreground: "0 0% 100%" },
  teal:   { main: "174 72% 40%", foreground: "0 0% 100%" },
};

// ── Sidebar color palettes ──
const sidebarPalettes: Record<string, Record<string, string>> = {
  dark: {
    "--sidebar-background": "222 47% 11%",
    "--sidebar-foreground": "213 31% 91%",
    "--sidebar-accent": "222 40% 16%",
    "--sidebar-accent-foreground": "213 31% 91%",
    "--sidebar-border": "222 30% 18%",
    "--sidebar-muted": "220 9% 46%",
  },
  light: {
    "--sidebar-background": "0 0% 98%",
    "--sidebar-foreground": "222 47% 11%",
    "--sidebar-accent": "220 14% 92%",
    "--sidebar-accent-foreground": "222 47% 11%",
    "--sidebar-border": "220 13% 91%",
    "--sidebar-muted": "220 9% 46%",
  },
  colored: {
    "--sidebar-background": "222 47% 15%",
    "--sidebar-foreground": "210 40% 96%",
    "--sidebar-accent": "222 40% 22%",
    "--sidebar-accent-foreground": "210 40% 96%",
    "--sidebar-border": "222 30% 25%",
    "--sidebar-muted": "218 11% 55%",
  },
};

function applyTheme(theme: string) {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  if (theme === "dark") {
    root.classList.add("dark");
  } else if (theme === "light") {
    root.classList.remove("dark");
  } else {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      root.classList.add("dark");
    }
  }
}

function applyFontSize(size: string) {
  const root = document.documentElement;
  if (size === "small") root.style.fontSize = "14px";
  else if (size === "large") root.style.fontSize = "18px";
  else root.style.fontSize = "16px";
}

function applyCompactMode(compact: boolean) {
  document.documentElement.classList.toggle("compact-mode", compact);
}

function applyAnimations(enabled: boolean) {
  document.documentElement.classList.toggle("no-animations", !enabled);
}

function applyAccentColor(color: string) {
  const palette = accentPalettes[color] || accentPalettes.amber;
  const root = document.documentElement;
  root.style.setProperty("--accent", palette.main);
  root.style.setProperty("--accent-foreground", palette.foreground);
  // Also update sidebar accent colors and chart-1 and ring for dark mode
  root.style.setProperty("--sidebar-primary", palette.main);
  root.style.setProperty("--sidebar-primary-foreground", palette.foreground);
  root.style.setProperty("--sidebar-ring", palette.main);
  root.style.setProperty("--chart-1", palette.main);
  // In dark mode, primary is the accent
  if (root.classList.contains("dark")) {
    root.style.setProperty("--primary", palette.main);
    root.style.setProperty("--primary-foreground", "222 47% 11%");
    root.style.setProperty("--ring", palette.main);
  }
}

function applySidebarColor(style: string) {
  const palette = sidebarPalettes[style] || sidebarPalettes.dark;
  const root = document.documentElement;
  for (const [prop, value] of Object.entries(palette)) {
    root.style.setProperty(prop, value);
  }
}

export function applyAllSettings() {
  const s = getAppSettings();
  applyTheme(s.theme || "system");
  applyFontSize(s.fontSize || "normal");
  applyCompactMode(s.compactMode ?? false);
  applyAnimations(s.animationsEnabled ?? true);
  applyAccentColor(s.accentColor || "amber");
  applySidebarColor(s.sidebarColor || "dark");
}

/** Format a number using the user's settings */
export function formatCurrency(amount: number): string {
  const s = getAppSettings();
  const places = s.decimalPlaces ?? 2;
  let formatted: string;
  
  if (s.roundingMethod === "floor") {
    amount = Math.floor(amount * Math.pow(10, places)) / Math.pow(10, places);
  } else if (s.roundingMethod === "ceil") {
    amount = Math.ceil(amount * Math.pow(10, places)) / Math.pow(10, places);
  }
  
  try {
    formatted = new Intl.NumberFormat(s.numberFormat || "en-PK", {
      minimumFractionDigits: places,
      maximumFractionDigits: places,
    }).format(amount);
  } catch {
    formatted = amount.toFixed(places);
  }
  
  return `${s.currencySymbol || "Rs"} ${formatted}`;
}

/** Format a date using user's timezone and format */
export function formatDate(date: string | Date): string {
  const s = getAppSettings();
  const d = typeof date === "string" ? new Date(date) : date;
  try {
    return d.toLocaleDateString(s.language === "ur" ? "ur-PK" : "en-PK", {
      timeZone: s.timezone || "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return d.toLocaleDateString();
  }
}

export function formatDateTime(date: string | Date): string {
  const s = getAppSettings();
  const d = typeof date === "string" ? new Date(date) : date;
  try {
    return d.toLocaleString(s.language === "ur" ? "ur-PK" : "en-PK", {
      timeZone: s.timezone || "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return d.toLocaleString();
  }
}

export function useAppSettings() {
  useEffect(() => {
    applyAllSettings();

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const s = getAppSettings();
      if (!s.theme || s.theme === "system") {
        applyTheme("system");
        applyAccentColor(s.accentColor || "amber");
      }
    };
    mq.addEventListener("change", handler);

    const storageHandler = (e: StorageEvent) => {
      if (e.key === "app_settings") applyAllSettings();
    };
    window.addEventListener("storage", storageHandler);

    return () => {
      mq.removeEventListener("change", handler);
      window.removeEventListener("storage", storageHandler);
    };
  }, []);
}

/** Hook: auto-logout after inactivity based on sessionTimeout setting */
export function useSessionTimeout(onTimeout: () => void) {
  useEffect(() => {
    const s = getAppSettings();
    const minutes = s.sessionTimeout || 30;
    const ms = minutes * 60 * 1000;
    
    let timer: ReturnType<typeof setTimeout>;
    
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        onTimeout();
      }, ms);
    };
    
    const events = ["mousedown", "keydown", "scroll", "touchstart", "mousemove"];
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();
    
    return () => {
      clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [onTimeout]);
}
