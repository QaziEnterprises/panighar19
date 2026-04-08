import { useState, useEffect } from "react";
import { Settings, Save, Store, Palette, Bell, Shield, Receipt, FileText, Percent, Globe, Database, Printer, Lock, HardDrive, Users, Trash2, Download, Upload, RefreshCw, Eye, EyeOff, MessageSquare, Smartphone, Monitor, Moon, Sun, Zap, MapPin, Phone, Mail, Type, Hash, Calendar, DollarSign, Tag, Layers, ToggleLeft, Volume2, ScanLine, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface AppSettings {
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

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("app_settings");
    if (stored) {
      try { setSettings({ ...defaultSettings, ...JSON.parse(stored) }); } catch { /* defaults */ }
    }
  }, []);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    localStorage.setItem("app_settings", JSON.stringify(settings));
    setSaved(true);
    // Apply settings immediately
    import("@/hooks/useAppSettings").then(({ applyAllSettings }) => applyAllSettings());
    toast.success("Settings saved successfully");
  };

  const handleReset = () => {
    if (!window.confirm("Reset all settings to defaults?")) return;
    setSettings(defaultSettings);
    setSaved(false);
    toast.info("Settings reset — click Save to apply");
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "app-settings.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Settings exported");
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const imported = JSON.parse(ev.target?.result as string);
          setSettings({ ...defaultSettings, ...imported });
          setSaved(false);
          toast.success("Settings imported — click Save to apply");
        } catch { toast.error("Invalid settings file"); }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const SwitchRow = ({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <div className="flex items-center justify-between">
      <div><Label>{label}</Label><p className="text-xs text-muted-foreground">{desc}</p></div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Settings className="h-6 w-6" /> Settings
          </h1>
          <p className="text-sm text-muted-foreground">Full control over every aspect of your application</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5"><Download className="h-3.5 w-3.5" /> Export</Button>
          <Button variant="outline" size="sm" onClick={handleImport} className="gap-1.5"><Upload className="h-3.5 w-3.5" /> Import</Button>
          <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" /> Reset</Button>
          <Button onClick={handleSave} disabled={saved} className="gap-2">
            <Save className="h-4 w-4" /> {saved ? "Saved ✓" : "Save Changes"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="business" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="business" className="gap-1.5 text-xs"><Store className="h-3.5 w-3.5" /> Business</TabsTrigger>
          <TabsTrigger value="localization" className="gap-1.5 text-xs"><Globe className="h-3.5 w-3.5" /> Locale</TabsTrigger>
          <TabsTrigger value="pos" className="gap-1.5 text-xs"><Receipt className="h-3.5 w-3.5" /> POS</TabsTrigger>
          <TabsTrigger value="invoice" className="gap-1.5 text-xs"><FileText className="h-3.5 w-3.5" /> Invoice</TabsTrigger>
          <TabsTrigger value="tax" className="gap-1.5 text-xs"><Percent className="h-3.5 w-3.5" /> Tax</TabsTrigger>
          <TabsTrigger value="receipt" className="gap-1.5 text-xs"><Printer className="h-3.5 w-3.5" /> Receipt</TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1.5 text-xs"><Bell className="h-3.5 w-3.5" /> Alerts</TabsTrigger>
          <TabsTrigger value="appearance" className="gap-1.5 text-xs"><Palette className="h-3.5 w-3.5" /> Theme</TabsTrigger>
          <TabsTrigger value="backup" className="gap-1.5 text-xs"><HardDrive className="h-3.5 w-3.5" /> Backup</TabsTrigger>
          <TabsTrigger value="printing" className="gap-1.5 text-xs"><Printer className="h-3.5 w-3.5" /> Print</TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5 text-xs"><Lock className="h-3.5 w-3.5" /> Security</TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5 text-xs"><Users className="h-3.5 w-3.5" /> Users</TabsTrigger>
          <TabsTrigger value="advanced" className="gap-1.5 text-xs"><Zap className="h-3.5 w-3.5" /> Advanced</TabsTrigger>
        </TabsList>

        {/* Business */}
        <TabsContent value="business">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Store className="h-4 w-4" /> Business Information</CardTitle>
              <CardDescription>Your shop identity and contact details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1"><Label>Business Name</Label><Input value={settings.businessName} onChange={(e) => updateSetting("businessName", e.target.value)} /></div>
                <div className="space-y-1"><Label>Tagline</Label><Input value={settings.businessTagline} onChange={(e) => updateSetting("businessTagline", e.target.value)} /></div>
                <div className="space-y-1"><Label>Phone</Label><Input value={settings.businessPhone} onChange={(e) => updateSetting("businessPhone", e.target.value)} placeholder="+92 300 1234567" /></div>
                <div className="space-y-1"><Label>Email</Label><Input type="email" value={settings.businessEmail} onChange={(e) => updateSetting("businessEmail", e.target.value)} placeholder="info@business.com" /></div>
                <div className="space-y-1"><Label>Website</Label><Input value={settings.businessWebsite} onChange={(e) => updateSetting("businessWebsite", e.target.value)} placeholder="https://yoursite.com" /></div>
                <div className="space-y-1"><Label>Logo URL</Label><Input value={settings.businessLogo} onChange={(e) => updateSetting("businessLogo", e.target.value)} placeholder="https://..." /></div>
                <div className="space-y-1 sm:col-span-2"><Label>Address</Label><Input value={settings.businessAddress} onChange={(e) => updateSetting("businessAddress", e.target.value)} placeholder="Full shop address" /></div>
              </div>
              <Separator />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1"><Label>Registration No.</Label><Input value={settings.businessRegistration} onChange={(e) => updateSetting("businessRegistration", e.target.value)} placeholder="Business registration #" /></div>
                <div className="space-y-1"><Label>NTN Number</Label><Input value={settings.businessNTN} onChange={(e) => updateSetting("businessNTN", e.target.value)} placeholder="National Tax Number" /></div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Localization */}
        <TabsContent value="localization">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Globe className="h-4 w-4" /> Localization & Regional</CardTitle>
              <CardDescription>Currency, date formats, and regional preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1">
                  <Label>Currency</Label>
                  <Select value={settings.currency} onValueChange={(v) => updateSetting("currency", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PKR">PKR (₨)</SelectItem>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="EUR">EUR (€)</SelectItem>
                      <SelectItem value="GBP">GBP (£)</SelectItem>
                      <SelectItem value="AED">AED (د.إ)</SelectItem>
                      <SelectItem value="SAR">SAR (﷼)</SelectItem>
                      <SelectItem value="INR">INR (₹)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Currency Symbol</Label><Input value={settings.currencySymbol} onChange={(e) => updateSetting("currencySymbol", e.target.value)} /></div>
                <div className="space-y-1">
                  <Label>Date Format</Label>
                  <Select value={settings.dateFormat} onValueChange={(v) => updateSetting("dateFormat", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dd/MM/yyyy">DD/MM/YYYY</SelectItem>
                      <SelectItem value="MM/dd/yyyy">MM/DD/YYYY</SelectItem>
                      <SelectItem value="yyyy-MM-dd">YYYY-MM-DD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Timezone</Label>
                  <Select value={settings.timezone} onValueChange={(v) => updateSetting("timezone", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Asia/Karachi">Pakistan (GMT+5)</SelectItem>
                      <SelectItem value="Asia/Dubai">Dubai (GMT+4)</SelectItem>
                      <SelectItem value="Asia/Kolkata">India (GMT+5:30)</SelectItem>
                      <SelectItem value="UTC">UTC</SelectItem>
                      <SelectItem value="America/New_York">US Eastern</SelectItem>
                      <SelectItem value="Europe/London">London (GMT)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Language</Label>
                  <Select value={settings.language} onValueChange={(v) => updateSetting("language", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="ur">Urdu</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Number Format</Label>
                  <Select value={settings.numberFormat} onValueChange={(v) => updateSetting("numberFormat", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en-PK">1,23,456.78</SelectItem>
                      <SelectItem value="en-US">123,456.78</SelectItem>
                      <SelectItem value="de-DE">123.456,78</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* POS */}
        <TabsContent value="pos">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4" /> POS & Payment Settings</CardTitle>
              <CardDescription>Point of sale behavior and payment defaults</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1">
                  <Label>Default Payment Method</Label>
                  <Select value={settings.defaultPaymentMethod} onValueChange={(v) => updateSetting("defaultPaymentMethod", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="bank">Bank Transfer</SelectItem>
                      <SelectItem value="jazzcash">JazzCash</SelectItem>
                      <SelectItem value="easypaisa">EasyPaisa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Default Payment Status</Label>
                  <Select value={settings.defaultPaymentStatus} onValueChange={(v) => updateSetting("defaultPaymentStatus", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="due">Due (Udhar)</SelectItem>
                      <SelectItem value="partial">Partial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>POS Grid Columns</Label>
                  <Select value={settings.posGridColumns} onValueChange={(v) => updateSetting("posGridColumns", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2 Columns</SelectItem>
                      <SelectItem value="3">3 Columns</SelectItem>
                      <SelectItem value="4">4 Columns</SelectItem>
                      <SelectItem value="5">5 Columns</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Separator />
              <div className="space-y-3">
                <SwitchRow label="Auto-Create Customer" desc="Auto-create when typing a new name in POS" checked={settings.autoCreateCustomer} onChange={(v) => updateSetting("autoCreateCustomer", v)} />
                <SwitchRow label="Enable Barcode Scanner" desc="Show barcode scan button on POS" checked={settings.enableBarcode} onChange={(v) => updateSetting("enableBarcode", v)} />
                <SwitchRow label="Sound on Sale" desc="Play a sound when a sale is completed" checked={settings.soundOnSale} onChange={(v) => updateSetting("soundOnSale", v)} />
                <SwitchRow label="Quick Actions" desc="Show quick action buttons (hold, discount, etc.)" checked={settings.posQuickActions} onChange={(v) => updateSetting("posQuickActions", v)} />
                <SwitchRow label="Show Stock in POS" desc="Display available stock quantity on POS product tiles" checked={settings.posShowStock} onChange={(v) => updateSetting("posShowStock", v)} />
                <SwitchRow label="Confirm Before Sale" desc="Show confirmation dialog before completing sale" checked={settings.posConfirmSale} onChange={(v) => updateSetting("posConfirmSale", v)} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Invoice */}
        <TabsContent value="invoice">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Invoice Settings</CardTitle>
              <CardDescription>Customize invoice numbering, terms, and layout</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1"><Label>Invoice Prefix</Label><Input value={settings.invoicePrefix} onChange={(e) => updateSetting("invoicePrefix", e.target.value)} /></div>
                <div className="space-y-1"><Label>Starting Number</Label><Input type="number" value={settings.invoiceStartNumber} onChange={(e) => updateSetting("invoiceStartNumber", Number(e.target.value))} /></div>
              </div>
              <div className="space-y-1">
                <Label>Default Terms & Conditions</Label>
                <Textarea value={settings.invoiceTerms} onChange={(e) => updateSetting("invoiceTerms", e.target.value)} rows={3} />
              </div>
              <div className="space-y-1">
                <Label>Default Invoice Notes</Label>
                <Textarea value={settings.invoiceNotes} onChange={(e) => updateSetting("invoiceNotes", e.target.value)} placeholder="Additional notes to appear on every invoice" rows={2} />
              </div>
              <Separator />
              <SwitchRow label="Show Signature Line" desc="Add a signature line at the bottom of invoices" checked={settings.showSignatureLine} onChange={(v) => updateSetting("showSignatureLine", v)} />
              <SwitchRow label="Show Terms on Invoice" desc="Print terms & conditions on invoices" checked={settings.showTermsOnInvoice} onChange={(v) => updateSetting("showTermsOnInvoice", v)} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tax */}
        <TabsContent value="tax">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Percent className="h-4 w-4" /> Tax Settings</CardTitle>
              <CardDescription>Configure tax calculations and display</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SwitchRow label="Enable Tax" desc="Apply tax on sales transactions" checked={settings.taxEnabled} onChange={(v) => updateSetting("taxEnabled", v)} />
              {settings.taxEnabled && (
                <>
                  <Separator />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1"><Label>Tax Label</Label><Input value={settings.taxLabel} onChange={(e) => updateSetting("taxLabel", e.target.value)} placeholder="e.g. GST, VAT" /></div>
                    <div className="space-y-1"><Label>Tax Rate (%)</Label><Input type="number" value={settings.taxRate} onChange={(e) => updateSetting("taxRate", Number(e.target.value))} min={0} max={100} step={0.5} /></div>
                    <div className="space-y-1"><Label>Tax Registration No.</Label><Input value={settings.taxRegistrationNo} onChange={(e) => updateSetting("taxRegistrationNo", e.target.value)} /></div>
                  </div>
                  <SwitchRow label="Tax Inclusive Pricing" desc="Product prices already include tax" checked={settings.taxInclusive} onChange={(v) => updateSetting("taxInclusive", v)} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Receipt */}
        <TabsContent value="receipt">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Receipt & Sharing</CardTitle>
              <CardDescription>Receipt layout and WhatsApp sharing</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SwitchRow label="Show Logo on Receipt" desc="Display business logo at top" checked={settings.receiptShowLogo} onChange={(v) => updateSetting("receiptShowLogo", v)} />
              <SwitchRow label="Show Tax on Receipt" desc="Display tax breakdown" checked={settings.receiptShowTax} onChange={(v) => updateSetting("receiptShowTax", v)} />
              <SwitchRow label="Show Barcode on Receipt" desc="Print barcode/QR code on receipt" checked={settings.receiptShowBarcode} onChange={(v) => updateSetting("receiptShowBarcode", v)} />
              <Separator />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Paper Size</Label>
                  <Select value={settings.receiptPaperSize} onValueChange={(v) => updateSetting("receiptPaperSize", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="58mm">58mm Thermal</SelectItem>
                      <SelectItem value="80mm">80mm Thermal</SelectItem>
                      <SelectItem value="a4">A4</SelectItem>
                      <SelectItem value="a5">A5</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Print Copies</Label><Input type="number" value={settings.receiptCopies} onChange={(e) => updateSetting("receiptCopies", Number(e.target.value))} min={1} max={5} /></div>
              </div>
              <div className="space-y-1"><Label>Receipt Footer Text</Label><Input value={settings.receiptFooterText} onChange={(e) => updateSetting("receiptFooterText", e.target.value)} /></div>
              <Separator />
              <h4 className="text-sm font-semibold flex items-center gap-2"><MessageSquare className="h-4 w-4" /> WhatsApp</h4>
              <SwitchRow label="Enable WhatsApp Sharing" desc="Show WhatsApp share button on invoices" checked={settings.enableWhatsApp} onChange={(v) => updateSetting("enableWhatsApp", v)} />
              {settings.enableWhatsApp && (
                <>
                  <div className="space-y-1"><Label>Default WhatsApp Number</Label><Input value={settings.whatsAppDefault} onChange={(e) => updateSetting("whatsAppDefault", e.target.value)} placeholder="+923001234567" /></div>
                  <div className="space-y-1">
                    <Label>Message Template</Label>
                    <Textarea value={settings.whatsAppTemplate} onChange={(e) => updateSetting("whatsAppTemplate", e.target.value)} rows={2} />
                    <p className="text-xs text-muted-foreground">Use {"{customer}"}, {"{invoice}"}, {"{total}"} as placeholders</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alerts */}
        <TabsContent value="alerts">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Bell className="h-4 w-4" /> Notifications & Alerts</CardTitle>
              <CardDescription>Control when and how you get notified</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SwitchRow label="Low Stock Alerts" desc="Notify when products are running low" checked={settings.lowStockAlert} onChange={(v) => updateSetting("lowStockAlert", v)} />
              {settings.lowStockAlert && (
                <div className="space-y-1 pl-4 border-l-2 border-muted">
                  <Label>Default Low Stock Threshold</Label>
                  <Input type="number" value={settings.lowStockThreshold} onChange={(e) => updateSetting("lowStockThreshold", Number(e.target.value))} />
                </div>
              )}
              <Separator />
              <SwitchRow label="Payment Due Alerts" desc="Alert when customer payments are overdue" checked={settings.paymentDueAlert} onChange={(v) => updateSetting("paymentDueAlert", v)} />
              <SwitchRow label="Daily Summary Alert" desc="Show daily summary notification" checked={settings.dailySummaryAlert} onChange={(v) => updateSetting("dailySummaryAlert", v)} />
              <SwitchRow label="Product Expiry Alerts" desc="Notify before products expire (if applicable)" checked={settings.expiryAlert} onChange={(v) => updateSetting("expiryAlert", v)} />
              <SwitchRow label="Email Alerts" desc="Send important alerts via email" checked={settings.emailAlerts} onChange={(v) => updateSetting("emailAlerts", v)} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appearance */}
        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Palette className="h-4 w-4" /> Theme & Appearance</CardTitle>
              <CardDescription>Customize the look and feel of your app</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1">
                  <Label>Theme</Label>
                  <Select value={settings.theme} onValueChange={(v) => updateSetting("theme", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">☀️ Light</SelectItem>
                      <SelectItem value="dark">🌙 Dark</SelectItem>
                      <SelectItem value="system">💻 System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Sidebar Style</Label>
                  <Select value={settings.sidebarColor} onValueChange={(v) => updateSetting("sidebarColor", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dark">Dark Sidebar</SelectItem>
                      <SelectItem value="light">Light Sidebar</SelectItem>
                      <SelectItem value="colored">Colored Sidebar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Accent Color</Label>
                  <Select value={settings.accentColor} onValueChange={(v) => updateSetting("accentColor", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="amber">🟡 Amber</SelectItem>
                      <SelectItem value="blue">🔵 Blue</SelectItem>
                      <SelectItem value="green">🟢 Green</SelectItem>
                      <SelectItem value="red">🔴 Red</SelectItem>
                      <SelectItem value="purple">🟣 Purple</SelectItem>
                      <SelectItem value="teal">🫧 Teal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Font Size</Label>
                  <Select value={settings.fontSize} onValueChange={(v) => updateSetting("fontSize", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">Small</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="large">Large</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Cursor Style</Label>
                  <Select value={settings.cursorStyle} onValueChange={(v) => updateSetting("cursorStyle", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="neon-glow">✨ Neon Glow</SelectItem>
                      <SelectItem value="simple-dot">● Simple Dot</SelectItem>
                      <SelectItem value="crosshair">+ Crosshair</SelectItem>
                      <SelectItem value="ring">◯ Ring</SelectItem>
                      <SelectItem value="none">🖱️ System Default</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Separator />
              <SwitchRow label="Compact Mode" desc="Reduce spacing and padding for denser layout" checked={settings.compactMode} onChange={(v) => updateSetting("compactMode", v)} />
              <SwitchRow label="Animations" desc="Enable smooth transitions and animations" checked={settings.animationsEnabled} onChange={(v) => updateSetting("animationsEnabled", v)} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Backup */}
        <TabsContent value="backup">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><HardDrive className="h-4 w-4" /> Backup & Data</CardTitle>
              <CardDescription>Automated backup and data retention settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SwitchRow label="Auto Backup" desc="Automatically backup data at set intervals" checked={settings.autoBackup} onChange={(v) => updateSetting("autoBackup", v)} />
              {settings.autoBackup && (
                <div className="space-y-1 pl-4 border-l-2 border-muted">
                  <Label>Backup Frequency</Label>
                  <Select value={settings.backupFrequency} onValueChange={(v) => updateSetting("backupFrequency", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Every Hour</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Separator />
              <div className="space-y-1">
                <Label>Data Retention (Days)</Label>
                <Input type="number" value={settings.dataRetentionDays} onChange={(e) => updateSetting("dataRetentionDays", Number(e.target.value))} min={30} max={3650} />
                <p className="text-xs text-muted-foreground">How long to keep old records</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Printing */}
        <TabsContent value="printing">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Printer className="h-4 w-4" /> Print Settings</CardTitle>
              <CardDescription>Printer configuration and print behavior</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SwitchRow label="Auto Print on Save" desc="Automatically print receipt when saving" checked={settings.printOnSave} onChange={(v) => updateSetting("printOnSave", v)} />
              <Separator />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Default Printer</Label>
                  <Select value={settings.defaultPrinter} onValueChange={(v) => updateSetting("defaultPrinter", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">System Default</SelectItem>
                      <SelectItem value="thermal58">Thermal 58mm</SelectItem>
                      <SelectItem value="thermal80">Thermal 80mm</SelectItem>
                      <SelectItem value="a4">A4 Printer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Print Margins</Label>
                  <Select value={settings.printMargins} onValueChange={(v) => updateSetting("printMargins", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="narrow">Narrow</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="wide">Wide</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Lock className="h-4 w-4" /> Security Settings</CardTitle>
              <CardDescription>Access control and security policies</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Session Timeout (minutes)</Label>
                  <Input type="number" value={settings.sessionTimeout} onChange={(e) => updateSetting("sessionTimeout", Number(e.target.value))} min={5} max={480} />
                  <p className="text-xs text-muted-foreground">Auto-logout after inactivity</p>
                </div>
                <div className="space-y-1">
                  <Label>Max Login Attempts</Label>
                  <Input type="number" value={settings.loginAttemptLimit} onChange={(e) => updateSetting("loginAttemptLimit", Number(e.target.value))} min={3} max={20} />
                  <p className="text-xs text-muted-foreground">Lock account after failed attempts</p>
                </div>
              </div>
              <Separator />
              <SwitchRow label="Require Periodic Password Change" desc="Force password change every 90 days" checked={settings.requirePasswordChange} onChange={(v) => updateSetting("requirePasswordChange", v)} />
              <SwitchRow label="Two-Factor Authentication" desc="Require 2FA for all users" checked={settings.twoFactorEnabled} onChange={(v) => updateSetting("twoFactorEnabled", v)} />
              <Separator />
              <div className="space-y-1">
                <Label>IP Whitelist</Label>
                <Input value={settings.ipWhitelist} onChange={(e) => updateSetting("ipWhitelist", e.target.value)} placeholder="Leave empty for no restriction" />
                <p className="text-xs text-muted-foreground">Comma-separated IPs (e.g. 192.168.1.1, 10.0.0.1)</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users */}
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> User Management</CardTitle>
              <CardDescription>Multi-user settings and role defaults</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SwitchRow label="Enable Multi-User" desc="Allow multiple users to access the system" checked={settings.enableMultiUser} onChange={(v) => updateSetting("enableMultiUser", v)} />
              <SwitchRow label="Allow Self-Registration" desc="Let new users sign up on their own" checked={settings.allowSelfRegistration} onChange={(v) => updateSetting("allowSelfRegistration", v)} />
              <Separator />
              <div className="space-y-1">
                <Label>Default Role for New Users</Label>
                <Select value={settings.defaultUserRole} onValueChange={(v) => updateSetting("defaultUserRole", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User (Standard)</SelectItem>
                    <SelectItem value="viewer">Viewer (Read-Only)</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">💡 Manage Users</p>
                <p>Go to <strong>Admin Panel</strong> from the sidebar to add, edit, or remove users and change their roles.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced */}
        <TabsContent value="advanced">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4" /> Advanced Settings</CardTitle>
              <CardDescription>Power user options and data handling</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1">
                  <Label>Export Format</Label>
                  <Select value={settings.exportFormat} onValueChange={(v) => updateSetting("exportFormat", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                      <SelectItem value="csv">CSV (.csv)</SelectItem>
                      <SelectItem value="pdf">PDF (.pdf)</SelectItem>
                      <SelectItem value="json">JSON (.json)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Decimal Places</Label>
                  <Select value={String(settings.decimalPlaces)} onValueChange={(v) => updateSetting("decimalPlaces", Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0</SelectItem>
                      <SelectItem value="1">1</SelectItem>
                      <SelectItem value="2">2</SelectItem>
                      <SelectItem value="3">3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Rounding Method</Label>
                  <Select value={settings.roundingMethod} onValueChange={(v) => updateSetting("roundingMethod", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="round">Round</SelectItem>
                      <SelectItem value="floor">Floor (Round Down)</SelectItem>
                      <SelectItem value="ceil">Ceil (Round Up)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Separator />
              <SwitchRow label="Allow Negative Sales" desc="Allow returns and negative sale amounts" checked={settings.negativeSalesAllowed} onChange={(v) => updateSetting("negativeSalesAllowed", v)} />
              <SwitchRow label="Edit After Save" desc="Allow editing transactions after saving" checked={settings.editAfterSave} onChange={(v) => updateSetting("editAfterSave", v)} />
              <SwitchRow label="Require Password for Delete" desc="Ask for password before deleting records" checked={settings.deleteRequiresPassword} onChange={(v) => updateSetting("deleteRequiresPassword", v)} />
              <Separator />
              <SwitchRow label="Enable Cache" desc="Cache data locally for faster loading" checked={settings.cacheEnabled} onChange={(v) => updateSetting("cacheEnabled", v)} />
              <SwitchRow label="Enable API Access" desc="Allow external API access to your data" checked={settings.enableAPI} onChange={(v) => updateSetting("enableAPI", v)} />
              <SwitchRow label="Debug Mode" desc="Show extra logging for troubleshooting" checked={settings.debugMode} onChange={(v) => updateSetting("debugMode", v)} />
              <Separator />
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <h4 className="text-sm font-semibold text-destructive mb-2 flex items-center gap-2"><Trash2 className="h-4 w-4" /> Danger Zone</h4>
                <p className="text-xs text-muted-foreground mb-3">These actions are irreversible. Proceed with caution.</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive hover:text-destructive-foreground" onClick={() => {
                    if (window.confirm("Clear ALL local settings and cache? This cannot be undone.")) {
                      localStorage.clear();
                      window.location.reload();
                    }
                  }}>
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Clear All Data
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
