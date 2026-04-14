import { useState, useEffect, useMemo, useCallback } from "react";
import { format } from "date-fns";
import {
  Calendar as CalendarIcon, Download, RefreshCw, Banknote, Smartphone,
  Building2, CreditCard, AlertCircle, SplitSquareHorizontal, FileSpreadsheet,
  TrendingUp, TrendingDown, Wallet, Receipt, BookOpen, ArrowUpRight, ArrowDownRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/customClient";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

// ── Types ──

interface SaleBill {
  id: string;
  invoice_no: string | null;
  total: number;
  paid_amount: number;
  payment_method: string | null;
  payment_status: string | null;
  customer_name: string | null;
  created_at: string;
}

interface LedgerEntry {
  id: string;
  description: string;
  credit: number;
  debit: number;
  contact_name: string | null;
}

interface Expense {
  id: string;
  amount: number;
  description: string | null;
  payment_method: string | null;
  category_name: string | null;
}

interface MethodTotals {
  cash: number;
  jazzcash: number;
  easypaisa: number;
  bank: number;
}

type BillCategory = "cash" | "jazzcash" | "easypaisa" | "bank" | "split" | "due";

interface CategorizedBill extends SaleBill {
  category: BillCategory;
  methodBreakdown?: Record<string, number>;
}

// ── Helpers ──

function normalizeMethod(m: string): string {
  const lower = m.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (lower.includes("jazz")) return "jazzcash";
  if (lower.includes("easy") || lower.includes("easi")) return "easypaisa";
  if (lower.includes("bank") || lower.includes("transfer")) return "bank";
  if (lower.includes("cash")) return "cash";
  return lower;
}

function parsePaymentMethod(pm: string | null): Record<string, number> | null {
  if (!pm) return null;
  const parts = pm.split(",").map(p => p.trim()).filter(Boolean);
  const result: Record<string, number> = {};
  for (const part of parts) {
    const colonIdx = part.lastIndexOf(":");
    if (colonIdx > 0) {
      const method = normalizeMethod(part.substring(0, colonIdx));
      const amount = Number(part.substring(colonIdx + 1));
      if (!isNaN(amount)) result[method] = (result[method] || 0) + amount;
    } else {
      const method = normalizeMethod(part);
      if (method) result[method] = -1;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

function categorizeBill(bill: SaleBill): CategorizedBill {
  if (bill.payment_status === "due" || bill.payment_status === "partial") {
    const parsed = parsePaymentMethod(bill.payment_method);
    if (bill.payment_status === "partial" && parsed) {
      const methods = Object.keys(parsed);
      const breakdown: Record<string, number> = {};
      for (const m of methods) {
        breakdown[m] = parsed[m] === -1 ? bill.paid_amount : parsed[m];
      }
      breakdown["due"] = Number(bill.total) - Number(bill.paid_amount);
      return { ...bill, category: "split", methodBreakdown: breakdown };
    }
    return { ...bill, category: "due" };
  }

  const parsed = parsePaymentMethod(bill.payment_method);
  if (!parsed) return { ...bill, category: "cash" };

  const methods = Object.keys(parsed);
  if (methods.length === 1) {
    const method = methods[0] as BillCategory;
    if (["cash", "jazzcash", "easypaisa", "bank"].includes(method)) {
      return { ...bill, category: method as BillCategory };
    }
    return { ...bill, category: "cash" };
  }

  const breakdown: Record<string, number> = {};
  for (const m of methods) {
    breakdown[m] = parsed[m] === -1 ? Number(bill.total) : parsed[m];
  }
  return { ...bill, category: "split", methodBreakdown: breakdown };
}

function calcMethodTotals(bills: CategorizedBill[]): MethodTotals {
  const totals: MethodTotals = { cash: 0, jazzcash: 0, easypaisa: 0, bank: 0 };
  for (const bill of bills) {
    if (bill.category === "due") continue;
    if (bill.category === "split" && bill.methodBreakdown) {
      for (const [m, amt] of Object.entries(bill.methodBreakdown)) {
        if (m === "due") continue;
        const key = normalizeMethod(m) as keyof MethodTotals;
        if (key in totals) totals[key] += amt;
      }
    } else {
      const key = bill.category as keyof MethodTotals;
      if (key in totals) totals[key] += Number(bill.paid_amount || bill.total);
    }
  }
  return totals;
}

const methodConfig = {
  cash: { label: "Cash", icon: Banknote, color: "text-green-600", bg: "bg-green-500/10", border: "border-green-500/20", iconBg: "bg-green-500/15" },
  jazzcash: { label: "JazzCash", icon: Smartphone, color: "text-red-600", bg: "bg-red-500/10", border: "border-red-500/20", iconBg: "bg-red-500/15" },
  easypaisa: { label: "EasyPaisa", icon: CreditCard, color: "text-emerald-600", bg: "bg-emerald-500/10", border: "border-emerald-500/20", iconBg: "bg-emerald-500/15" },
  bank: { label: "Bank Transfer", icon: Building2, color: "text-blue-600", bg: "bg-blue-500/10", border: "border-blue-500/20", iconBg: "bg-blue-500/15" },
  split: { label: "Split Payment", icon: SplitSquareHorizontal, color: "text-purple-600", bg: "bg-purple-500/10", border: "border-purple-500/20", iconBg: "bg-purple-500/15" },
  due: { label: "Unpaid / Due", icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/20", iconBg: "bg-destructive/15" },
} as const;

// ── Component ──

export default function SummaryPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [bills, setBills] = useState<SaleBill[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["cash", "jazzcash", "easypaisa", "bank", "split", "due", "expenses", "ledger"]));

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [salesRes, ledgerRes, expensesRes] = await Promise.all([
        supabase
          .from("sale_transactions")
          .select("id, invoice_no, total, paid_amount, payment_method, payment_status, customer_id, created_at")
          .eq("date", dateStr),
        supabase
          .from("ledger_entries")
          .select("id, description, credit, debit, contact_id")
          .eq("date", dateStr),
        supabase
          .from("expenses")
          .select("id, amount, description, payment_method, category_id")
          .eq("date", dateStr),
      ]);

      const customerIds = [...new Set((salesRes.data || []).map(s => s.customer_id).filter(Boolean))];
      const contactIds = [...new Set((ledgerRes.data || []).map(l => l.contact_id).filter(Boolean))];
      const allContactIds = [...new Set([...customerIds, ...contactIds])];

      let contactMap: Record<string, string> = {};
      if (allContactIds.length > 0) {
        const { data: contacts } = await supabase.from("contacts").select("id, name").in("id", allContactIds);
        if (contacts) for (const c of contacts) contactMap[c.id] = c.name;
      }

      const catIds = [...new Set((expensesRes.data || []).map(e => e.category_id).filter(Boolean))];
      let catMap: Record<string, string> = {};
      if (catIds.length > 0) {
        const { data: cats } = await supabase.from("expense_categories").select("id, name").in("id", catIds);
        if (cats) for (const c of cats) catMap[c.id] = c.name;
      }

      setBills((salesRes.data || []).map(s => ({
        id: s.id,
        invoice_no: s.invoice_no,
        total: Number(s.total || 0),
        paid_amount: Number(s.paid_amount || 0),
        payment_method: s.payment_method,
        payment_status: s.payment_status,
        customer_name: s.customer_id ? contactMap[s.customer_id] || "Unknown" : "Walk-in",
        created_at: s.created_at,
      })));

      setLedgerEntries((ledgerRes.data || []).map(l => ({
        id: l.id,
        description: l.description,
        credit: Number(l.credit || 0),
        debit: Number(l.debit || 0),
        contact_name: l.contact_id ? contactMap[l.contact_id] || "Unknown" : null,
      })));

      setExpenses((expensesRes.data || []).map(e => ({
        id: e.id,
        amount: Number(e.amount || 0),
        description: e.description,
        payment_method: e.payment_method,
        category_name: e.category_id ? catMap[e.category_id] || null : null,
      })));
    } catch (e) {
      console.error("Fetch error:", e);
      toast.error("Failed to load report data");
    } finally {
      setLoading(false);
    }
  }, [dateStr]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Computed ──
  const categorizedBills = useMemo(() => bills.map(categorizeBill), [bills]);
  const billsByCategory = useMemo(() => {
    const groups: Record<BillCategory, CategorizedBill[]> = { cash: [], jazzcash: [], easypaisa: [], bank: [], split: [], due: [] };
    for (const b of categorizedBills) groups[b.category].push(b);
    return groups;
  }, [categorizedBills]);
  const methodTotals = useMemo(() => calcMethodTotals(categorizedBills), [categorizedBills]);
  const ledgerCredits = useMemo(() => ledgerEntries.reduce((s, l) => s + l.credit, 0), [ledgerEntries]);
  const ledgerDebits = useMemo(() => ledgerEntries.reduce((s, l) => s + l.debit, 0), [ledgerEntries]);
  const totalExpenses = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
  const totalIncome = methodTotals.cash + methodTotals.jazzcash + methodTotals.easypaisa + methodTotals.bank + ledgerCredits;
  const netCash = totalIncome - totalExpenses - ledgerDebits;
  const totalDue = useMemo(() => billsByCategory.due.reduce((s, b) => s + (b.total - b.paid_amount), 0), [billsByCategory.due]);

  // ── Export ──
  const exportExcel = () => {
    const rows = categorizedBills.map(b => ({
      Invoice: b.invoice_no || "-",
      Customer: b.customer_name || "-",
      Total: b.total,
      Paid: b.paid_amount,
      Method: b.payment_method || "-",
      Status: b.payment_status || "paid",
      Category: b.category,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Daily Report");
    const expRows = expenses.map(e => ({
      Description: e.description || "-",
      Amount: e.amount,
      Category: e.category_name || "-",
      Method: e.payment_method || "-",
    }));
    const ws2 = XLSX.utils.json_to_sheet(expRows);
    XLSX.utils.book_append_sheet(wb, ws2, "Expenses");
    XLSX.writeFile(wb, `daily_report_${dateStr}.xlsx`);
    toast.success("Exported to Excel");
  };

  // ── Section Header ──
  const SectionHeader = ({ sectionKey, title, icon: Icon, count, total, color, iconBg }: {
    sectionKey: string; title: string; icon: any; count: number; total: number; color: string; iconBg: string;
  }) => {
    const isOpen = expandedSections.has(sectionKey);
    return (
      <button
        onClick={() => toggleSection(sectionKey)}
        className="w-full flex items-center justify-between py-3 px-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", iconBg)}>
            <Icon className={cn("h-4 w-4", color)} />
          </div>
          <span className="font-semibold text-sm">{title}</span>
          <Badge variant="secondary" className="text-xs px-2 py-0">{count}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn("font-bold text-sm", color)}>Rs {total.toLocaleString()}</span>
          <svg className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
        </div>
      </button>
    );
  };

  // ── Bill Rows ──
  const BillRows = ({ bills: billList, showBreakdown, showDue }: { bills: CategorizedBill[]; showBreakdown?: boolean; showDue?: boolean }) => (
    <div className="mt-2 rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/40 text-xs">
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Invoice</th>
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Customer</th>
            <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Total</th>
            <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Paid</th>
            {showDue && <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Due</th>}
            {showBreakdown && <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Breakdown</th>}
            <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Time</th>
          </tr>
        </thead>
        <tbody>
          {billList.map((b, i) => (
            <tr key={b.id} className={cn("border-t transition-colors hover:bg-muted/20", i % 2 === 0 ? "bg-background" : "bg-muted/10")}>
              <td className="px-3 py-2.5 font-mono text-xs font-medium">{b.invoice_no || "-"}</td>
              <td className="px-3 py-2.5">{b.customer_name || "-"}</td>
              <td className="px-3 py-2.5 text-right font-medium">Rs {b.total.toLocaleString()}</td>
              <td className="px-3 py-2.5 text-right text-green-600 font-medium">Rs {Number(b.paid_amount).toLocaleString()}</td>
              {showDue && (
                <td className="px-3 py-2.5 text-right text-destructive font-bold">
                  Rs {(b.total - b.paid_amount).toLocaleString()}
                </td>
              )}
              {showBreakdown && (
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {b.methodBreakdown && Object.entries(b.methodBreakdown).map(([m, amt]) => (
                      <Badge key={m} variant="outline" className="text-[10px] px-1.5 py-0">
                        {m}: Rs {amt.toLocaleString()}
                      </Badge>
                    ))}
                  </div>
                </td>
              )}
              <td className="px-3 py-2.5 text-right text-muted-foreground text-xs">
                {format(new Date(b.created_at), "hh:mm a")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto">
      {/* ─── Header ─── */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Receipt className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Daily Cash Report</h1>
          </div>
          <p className="text-sm text-muted-foreground">{format(selectedDate, "EEEE, MMMM d, yyyy")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 shadow-sm">
                <CalendarIcon className="h-4 w-4" />
                {format(selectedDate, "MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          <Button size="sm" onClick={fetchData} disabled={loading} variant="outline" className="gap-2 shadow-sm">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button size="sm" variant="outline" onClick={exportExcel} disabled={bills.length === 0} className="gap-2 shadow-sm">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <RefreshCw className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading report...</p>
        </div>
      ) : bills.length === 0 && expenses.length === 0 && ledgerEntries.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed p-16 text-center">
          <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground font-medium">No transactions found</p>
          <p className="text-xs text-muted-foreground mt-1">{format(selectedDate, "MMMM d, yyyy")}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ─── Net Cash Hero ─── */}
          <Card className="overflow-hidden border-0 shadow-lg">
            <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-6">
              <div className="flex items-center gap-2 mb-3">
                <Wallet className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Net Cash Position</span>
              </div>
              <p className={cn("text-5xl font-extrabold tracking-tight", netCash >= 0 ? "text-green-600" : "text-destructive")}>
                Rs {Math.abs(netCash).toLocaleString()}
                {netCash < 0 && <span className="text-lg ml-1">(deficit)</span>}
              </p>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span className="flex items-center gap-1.5 text-green-600">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  Income: Rs {totalIncome.toLocaleString()}
                </span>
                <span className="flex items-center gap-1.5 text-destructive">
                  <ArrowDownRight className="h-3.5 w-3.5" />
                  Expenses: Rs {totalExpenses.toLocaleString()}
                </span>
                {ledgerDebits > 0 && (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    Ledger Debits: Rs {ledgerDebits.toLocaleString()}
                  </span>
                )}
                {totalDue > 0 && (
                  <span className="flex items-center gap-1.5 text-amber-600">
                    Outstanding: Rs {totalDue.toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </Card>

          {/* ─── Payment Method Breakdown ─── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {(["cash", "jazzcash", "easypaisa", "bank"] as const).map(method => {
              const cfg = methodConfig[method];
              const Icon = cfg.icon;
              const amount = methodTotals[method];
              const billCount = billsByCategory[method].length;
              return (
                <Card key={method} className={cn("border", cfg.border, "transition-all hover:shadow-md")}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", cfg.iconBg)}>
                        <Icon className={cn("h-4.5 w-4.5", cfg.color)} />
                      </div>
                      {billCount > 0 && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{billCount} bills</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-medium">{cfg.label}</p>
                    <p className={cn("text-xl font-bold mt-0.5", cfg.color)}>Rs {amount.toLocaleString()}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* ─── Quick Stats Row ─── */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-amber-500/20">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <Receipt className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Bills</p>
                  <p className="text-lg font-bold">{bills.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-destructive/20">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-destructive/15 flex items-center justify-center">
                  <TrendingDown className="h-4 w-4 text-destructive" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Expenses</p>
                  <p className="text-lg font-bold text-destructive">Rs {totalExpenses.toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-blue-500/20">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-blue-500/15 flex items-center justify-center">
                  <BookOpen className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ledger</p>
                  <p className="text-lg font-bold text-green-600">+{ledgerCredits.toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Separator />

          {/* ─── Bill Sections ─── */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Transaction Details
            </h2>

            {/* Cash, JazzCash, EasyPaisa, Bank */}
            {(["cash", "jazzcash", "easypaisa", "bank"] as const).map(method => {
              const cfg = methodConfig[method];
              const methodBills = billsByCategory[method];
              if (methodBills.length === 0) return null;
              const total = methodBills.reduce((s, b) => s + Number(b.paid_amount || b.total), 0);
              return (
                <div key={method}>
                  <SectionHeader
                    sectionKey={method}
                    title={`${cfg.label} Bills`}
                    icon={cfg.icon}
                    count={methodBills.length}
                    total={total}
                    color={cfg.color}
                    iconBg={cfg.iconBg}
                  />
                  {expandedSections.has(method) && <BillRows bills={methodBills} />}
                </div>
              );
            })}

            {/* Split */}
            {billsByCategory.split.length > 0 && (
              <div>
                <SectionHeader
                  sectionKey="split"
                  title="Split Payment Bills"
                  icon={methodConfig.split.icon}
                  count={billsByCategory.split.length}
                  total={billsByCategory.split.reduce((s, b) => s + Number(b.paid_amount || b.total), 0)}
                  color={methodConfig.split.color}
                  iconBg={methodConfig.split.iconBg}
                />
                {expandedSections.has("split") && <BillRows bills={billsByCategory.split} showBreakdown />}
              </div>
            )}

            {/* Due */}
            {billsByCategory.due.length > 0 && (
              <div>
                <SectionHeader
                  sectionKey="due"
                  title="Unpaid / Due Bills"
                  icon={methodConfig.due.icon}
                  count={billsByCategory.due.length}
                  total={totalDue}
                  color={methodConfig.due.color}
                  iconBg={methodConfig.due.iconBg}
                />
                {expandedSections.has("due") && <BillRows bills={billsByCategory.due} showDue />}
              </div>
            )}
          </div>

          {/* ─── Expenses Detail ─── */}
          {expenses.length > 0 && (
            <div>
              <Separator className="mb-3" />
              <SectionHeader
                sectionKey="expenses"
                title="Expenses"
                icon={TrendingDown}
                count={expenses.length}
                total={totalExpenses}
                color="text-destructive"
                iconBg="bg-destructive/15"
              />
              {expandedSections.has("expenses") && (
                <div className="mt-2 rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/40 text-xs">
                        <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Description</th>
                        <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Category</th>
                        <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Method</th>
                        <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.map((e, i) => (
                        <tr key={e.id} className={cn("border-t hover:bg-muted/20", i % 2 === 0 ? "bg-background" : "bg-muted/10")}>
                          <td className="px-3 py-2.5">{e.description || "-"}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{e.category_name || "-"}</td>
                          <td className="px-3 py-2.5 text-muted-foreground text-xs">{e.payment_method || "-"}</td>
                          <td className="px-3 py-2.5 text-right text-destructive font-medium">Rs {e.amount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ─── Ledger Detail ─── */}
          {ledgerEntries.length > 0 && (
            <div>
              <Separator className="mb-3" />
              <SectionHeader
                sectionKey="ledger"
                title="Ledger Entries"
                icon={BookOpen}
                count={ledgerEntries.length}
                total={ledgerCredits - ledgerDebits}
                color="text-blue-600"
                iconBg="bg-blue-500/15"
              />
              {expandedSections.has("ledger") && (
                <div className="mt-2 rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/40 text-xs">
                        <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Description</th>
                        <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Contact</th>
                        <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Credit</th>
                        <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Debit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerEntries.map((l, i) => (
                        <tr key={l.id} className={cn("border-t hover:bg-muted/20", i % 2 === 0 ? "bg-background" : "bg-muted/10")}>
                          <td className="px-3 py-2.5">{l.description}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{l.contact_name || "-"}</td>
                          <td className="px-3 py-2.5 text-right text-green-600 font-medium">
                            {l.credit > 0 ? `Rs ${l.credit.toLocaleString()}` : "-"}
                          </td>
                          <td className="px-3 py-2.5 text-right text-destructive font-medium">
                            {l.debit > 0 ? `Rs ${l.debit.toLocaleString()}` : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
