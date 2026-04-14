import { useState, useEffect, useMemo, useCallback } from "react";
import { format } from "date-fns";
import {
  Calendar as CalendarIcon, Download, RefreshCw, Banknote, Smartphone,
  Building2, CreditCard, AlertCircle, SplitSquareHorizontal,
  TrendingDown, Wallet, Receipt, BookOpen, ChevronDown, Minus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

interface MethodTotals { cash: number; jazzcash: number; easypaisa: number; bank: number; }
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
      for (const m of methods) breakdown[m] = parsed[m] === -1 ? bill.paid_amount : parsed[m];
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
    if (["cash", "jazzcash", "easypaisa", "bank"].includes(method)) return { ...bill, category: method as BillCategory };
    return { ...bill, category: "cash" };
  }
  const breakdown: Record<string, number> = {};
  for (const m of methods) breakdown[m] = parsed[m] === -1 ? Number(bill.total) : parsed[m];
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

const methodMeta = {
  cash: { label: "Cash", icon: Banknote, accent: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30", dot: "bg-green-500" },
  jazzcash: { label: "JazzCash", icon: Smartphone, accent: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30", dot: "bg-red-500" },
  easypaisa: { label: "EasyPaisa", icon: CreditCard, accent: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30", dot: "bg-emerald-500" },
  bank: { label: "Bank Transfer", icon: Building2, accent: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30", dot: "bg-blue-500" },
};

// ── Component ──
export default function SummaryPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [bills, setBills] = useState<SaleBill[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const toggle = (k: string) => setCollapsed(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [salesRes, ledgerRes, expensesRes] = await Promise.all([
        supabase.from("sale_transactions").select("id, invoice_no, total, paid_amount, payment_method, payment_status, customer_id, created_at").eq("date", dateStr),
        supabase.from("ledger_entries").select("id, description, credit, debit, contact_id").eq("date", dateStr),
        supabase.from("expenses").select("id, amount, description, payment_method, category_id").eq("date", dateStr),
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
        id: s.id, invoice_no: s.invoice_no, total: Number(s.total || 0), paid_amount: Number(s.paid_amount || 0),
        payment_method: s.payment_method, payment_status: s.payment_status,
        customer_name: s.customer_id ? contactMap[s.customer_id] || "Unknown" : "Walk-in", created_at: s.created_at,
      })));
      setLedgerEntries((ledgerRes.data || []).map(l => ({
        id: l.id, description: l.description, credit: Number(l.credit || 0), debit: Number(l.debit || 0),
        contact_name: l.contact_id ? contactMap[l.contact_id] || "Unknown" : null,
      })));
      setExpenses((expensesRes.data || []).map(e => ({
        id: e.id, amount: Number(e.amount || 0), description: e.description,
        payment_method: e.payment_method, category_name: e.category_id ? catMap[e.category_id] || null : null,
      })));
    } catch {
      toast.error("Failed to load report data");
    } finally {
      setLoading(false);
    }
  }, [dateStr]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Computed ──
  const categorizedBills = useMemo(() => bills.map(categorizeBill), [bills]);
  const billsByCategory = useMemo(() => {
    const g: Record<BillCategory, CategorizedBill[]> = { cash: [], jazzcash: [], easypaisa: [], bank: [], split: [], due: [] };
    for (const b of categorizedBills) g[b.category].push(b);
    return g;
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
      Invoice: b.invoice_no || "-", Customer: b.customer_name || "-", Total: b.total,
      Paid: b.paid_amount, Method: b.payment_method || "-", Status: b.payment_status || "paid", Category: b.category,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Daily Report");
    const expRows = expenses.map(e => ({ Description: e.description || "-", Amount: e.amount, Category: e.category_name || "-", Method: e.payment_method || "-" }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expRows), "Expenses");
    XLSX.writeFile(wb, `daily_report_${dateStr}.xlsx`);
    toast.success("Exported to Excel");
  };

  // ── Reusable bill table ──
  const BillTable = ({ items, showBreakdown, showDue }: { items: CategorizedBill[]; showBreakdown?: boolean; showDue?: boolean }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/50">
            <th className="py-2 px-3 text-left font-semibold text-muted-foreground">#</th>
            <th className="py-2 px-3 text-left font-semibold text-muted-foreground">Invoice</th>
            <th className="py-2 px-3 text-left font-semibold text-muted-foreground">Customer</th>
            <th className="py-2 px-3 text-right font-semibold text-muted-foreground">Amount</th>
            <th className="py-2 px-3 text-right font-semibold text-muted-foreground">Paid</th>
            {showDue && <th className="py-2 px-3 text-right font-semibold text-muted-foreground">Due</th>}
            {showBreakdown && <th className="py-2 px-3 text-left font-semibold text-muted-foreground">Split Detail</th>}
            <th className="py-2 px-3 text-right font-semibold text-muted-foreground">Time</th>
          </tr>
        </thead>
        <tbody>
          {items.map((b, i) => (
            <tr key={b.id} className={cn("border-b border-border/30 hover:bg-muted/30 transition-colors", i % 2 !== 0 && "bg-muted/15")}>
              <td className="py-2 px-3 text-muted-foreground">{i + 1}</td>
              <td className="py-2 px-3 font-mono font-medium">{b.invoice_no || "—"}</td>
              <td className="py-2 px-3">{b.customer_name || "—"}</td>
              <td className="py-2 px-3 text-right font-semibold">Rs {b.total.toLocaleString()}</td>
              <td className="py-2 px-3 text-right text-green-600 font-semibold">Rs {Number(b.paid_amount).toLocaleString()}</td>
              {showDue && <td className="py-2 px-3 text-right text-destructive font-bold">Rs {(b.total - b.paid_amount).toLocaleString()}</td>}
              {showBreakdown && (
                <td className="py-2 px-3">
                  <div className="flex flex-wrap gap-1">
                    {b.methodBreakdown && Object.entries(b.methodBreakdown).map(([m, amt]) => (
                      <span key={m} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                        {m}: Rs {amt.toLocaleString()}
                      </span>
                    ))}
                  </div>
                </td>
              )}
              <td className="py-2 px-3 text-right text-muted-foreground">{format(new Date(b.created_at), "hh:mm a")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // ── Section wrapper ──
  const Section = ({ id, title, icon: Icon, count, total, accent, children }: {
    id: string; title: string; icon: any; count: number; total: number; accent: string; children: React.ReactNode;
  }) => {
    const isOpen = !collapsed.has(id);
    return (
      <div className="rounded-xl border bg-card overflow-hidden">
        <button onClick={() => toggle(id)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-2.5">
            <Icon className={cn("h-4 w-4", accent)} />
            <span className="font-semibold text-sm">{title}</span>
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{count}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("font-bold text-sm", accent)}>Rs {total.toLocaleString()}</span>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
          </div>
        </button>
        {isOpen && <div className="border-t">{children}</div>}
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* ─── Header Bar ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Daily Cash Report
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">{format(selectedDate, "EEEE, MMMM d, yyyy")}</p>
        </div>
        <div className="flex gap-1.5">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                <CalendarIcon className="h-3.5 w-3.5" />
                {format(selectedDate, "MMM d")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="single" selected={selectedDate} onSelect={(d) => d && setSelectedDate(d)} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <Button size="sm" variant="outline" onClick={fetchData} disabled={loading} className="h-8 w-8 p-0">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
          <Button size="sm" variant="outline" onClick={exportExcel} disabled={bills.length === 0} className="h-8 w-8 p-0">
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <RefreshCw className="h-6 w-6 animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      ) : bills.length === 0 && expenses.length === 0 && ledgerEntries.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed p-16 text-center">
          <Receipt className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-muted-foreground text-sm">No transactions on {format(selectedDate, "MMMM d, yyyy")}</p>
        </div>
      ) : (
        <>
          {/* ═══════════════ TOP: NET CASH POSITION ═══════════════ */}
          <div className="rounded-xl border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Net Cash Position</span>
              </div>
              {totalDue > 0 && (
                <span className="text-xs font-medium text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full">
                  Rs {totalDue.toLocaleString()} outstanding
                </span>
              )}
            </div>

            {/* Formula line */}
            <div className="flex flex-wrap items-baseline gap-2 mb-1">
              <span className="text-3xl font-extrabold tracking-tight" style={{ color: netCash >= 0 ? "hsl(var(--chart-2))" : "hsl(var(--destructive))" }}>
                Rs {Math.abs(netCash).toLocaleString()}
              </span>
              {netCash < 0 && <span className="text-sm text-destructive font-medium">(deficit)</span>}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Total Income (Rs {totalIncome.toLocaleString()}) <Minus className="inline h-3 w-3 mx-0.5" /> Total Expenses (Rs {totalExpenses.toLocaleString()})
              {ledgerDebits > 0 && <> <Minus className="inline h-3 w-3 mx-0.5" /> Ledger Debits (Rs {ledgerDebits.toLocaleString()})</>}
            </p>
          </div>

          {/* ═══════════════ PAYMENT METHOD AMOUNTS ═══════════════ */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {(["cash", "jazzcash", "easypaisa", "bank"] as const).map(method => {
              const meta = methodMeta[method];
              const Icon = meta.icon;
              return (
                <div key={method} className={cn("rounded-xl border p-3.5", meta.bg)}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={cn("h-2 w-2 rounded-full", meta.dot)} />
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{meta.label}</span>
                  </div>
                  <p className={cn("text-lg font-bold", meta.accent)}>Rs {methodTotals[method].toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{billsByCategory[method].length} bill{billsByCategory[method].length !== 1 ? "s" : ""}</p>
                </div>
              );
            })}
          </div>

          {/* ═══════════════ EXPENSES SUMMARY ═══════════════ */}
          {expenses.length > 0 && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-destructive" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Total Expenses</span>
                </div>
                <span className="text-lg font-bold text-destructive">Rs {totalExpenses.toLocaleString()}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2">
                {expenses.map(e => (
                  <span key={e.id} className="text-[11px] text-muted-foreground">
                    {e.description || e.category_name || "Expense"}: <span className="font-medium text-foreground">Rs {e.amount.toLocaleString()}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ═══════════════ LEDGER SUMMARY ═══════════════ */}
          {ledgerEntries.length > 0 && (
            <div className="rounded-xl border border-blue-500/20 bg-blue-50/50 dark:bg-blue-950/20 p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-blue-600" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Ledger Entries</span>
                </div>
                <div className="flex gap-3 text-xs font-bold">
                  <span className="text-green-600">+Rs {ledgerCredits.toLocaleString()}</span>
                  {ledgerDebits > 0 && <span className="text-destructive">-Rs {ledgerDebits.toLocaleString()}</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2">
                {ledgerEntries.map(l => (
                  <span key={l.id} className="text-[11px] text-muted-foreground">
                    {l.description}{l.contact_name ? ` (${l.contact_name})` : ""}:
                    {l.credit > 0 && <span className="font-medium text-green-600 ml-1">+Rs {l.credit.toLocaleString()}</span>}
                    {l.debit > 0 && <span className="font-medium text-destructive ml-1">-Rs {l.debit.toLocaleString()}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ═══════════════ BILL SECTIONS ═══════════════ */}
          <div className="space-y-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-1">Transaction Breakdown</p>

            {/* Cash Bills */}
            {billsByCategory.cash.length > 0 && (
              <Section id="cash" title="Cash Bills" icon={Banknote} count={billsByCategory.cash.length}
                total={billsByCategory.cash.reduce((s, b) => s + Number(b.paid_amount || b.total), 0)} accent="text-green-600">
                <BillTable items={billsByCategory.cash} />
              </Section>
            )}

            {/* JazzCash Bills */}
            {billsByCategory.jazzcash.length > 0 && (
              <Section id="jazzcash" title="JazzCash Bills" icon={Smartphone} count={billsByCategory.jazzcash.length}
                total={billsByCategory.jazzcash.reduce((s, b) => s + Number(b.paid_amount || b.total), 0)} accent="text-red-600">
                <BillTable items={billsByCategory.jazzcash} />
              </Section>
            )}

            {/* EasyPaisa Bills */}
            {billsByCategory.easypaisa.length > 0 && (
              <Section id="easypaisa" title="EasyPaisa Bills" icon={CreditCard} count={billsByCategory.easypaisa.length}
                total={billsByCategory.easypaisa.reduce((s, b) => s + Number(b.paid_amount || b.total), 0)} accent="text-emerald-600">
                <BillTable items={billsByCategory.easypaisa} />
              </Section>
            )}

            {/* Bank Transfer Bills */}
            {billsByCategory.bank.length > 0 && (
              <Section id="bank" title="Bank Transfer Bills" icon={Building2} count={billsByCategory.bank.length}
                total={billsByCategory.bank.reduce((s, b) => s + Number(b.paid_amount || b.total), 0)} accent="text-blue-600">
                <BillTable items={billsByCategory.bank} />
              </Section>
            )}

            {/* Split Payment Bills */}
            {billsByCategory.split.length > 0 && (
              <Section id="split" title="Split Payment Bills" icon={SplitSquareHorizontal} count={billsByCategory.split.length}
                total={billsByCategory.split.reduce((s, b) => s + Number(b.paid_amount || b.total), 0)} accent="text-purple-600">
                <BillTable items={billsByCategory.split} showBreakdown />
              </Section>
            )}

            {/* Unpaid / Due Bills */}
            {billsByCategory.due.length > 0 && (
              <Section id="due" title="Unpaid / Due Bills" icon={AlertCircle} count={billsByCategory.due.length}
                total={totalDue} accent="text-destructive">
                <BillTable items={billsByCategory.due} showDue />
              </Section>
            )}
          </div>
        </>
      )}
    </div>
  );
}
