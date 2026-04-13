import { useState, useEffect, useMemo, useCallback } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Download, FileSpreadsheet, RefreshCw, Banknote, Smartphone, Building2, CreditCard, AlertCircle, SplitSquareHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      if (method) result[method] = -1; // marker: single method, amount is the bill total
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

function categorizeBill(bill: SaleBill): CategorizedBill {
  // Due / unpaid first
  if (bill.payment_status === "due" || bill.payment_status === "partial") {
    // Check if partial has some paid portion
    const parsed = parsePaymentMethod(bill.payment_method);
    if (bill.payment_status === "partial" && parsed) {
      // Has method info — treat as split if multiple or single method + due
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
  if (!parsed) return { ...bill, category: "cash" }; // default to cash

  const methods = Object.keys(parsed);
  if (methods.length === 1) {
    const method = methods[0] as BillCategory;
    if (["cash", "jazzcash", "easypaisa", "bank"].includes(method)) {
      return { ...bill, category: method as BillCategory };
    }
    return { ...bill, category: "cash" };
  }

  // Multiple methods = split
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

// ── Component ──

export default function SummaryPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [bills, setBills] = useState<SaleBill[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const dateStr = format(selectedDate, "yyyy-MM-dd");

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

      // Fetch customer names for bills
      const customerIds = [...new Set((salesRes.data || []).map(s => s.customer_id).filter(Boolean))];
      const contactIds = [...new Set((ledgerRes.data || []).map(l => l.contact_id).filter(Boolean))];
      const allContactIds = [...new Set([...customerIds, ...contactIds])];

      let contactMap: Record<string, string> = {};
      if (allContactIds.length > 0) {
        const { data: contacts } = await supabase
          .from("contacts")
          .select("id, name")
          .in("id", allContactIds);
        if (contacts) {
          for (const c of contacts) contactMap[c.id] = c.name;
        }
      }

      // Fetch category names for expenses
      const catIds = [...new Set((expensesRes.data || []).map(e => e.category_id).filter(Boolean))];
      let catMap: Record<string, string> = {};
      if (catIds.length > 0) {
        const { data: cats } = await supabase
          .from("expense_categories")
          .select("id, name")
          .in("id", catIds);
        if (cats) {
          for (const c of cats) catMap[c.id] = c.name;
        }
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

    // Add expenses sheet
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

  // ── Bill Table Renderer ──

  const BillTable = ({ title, icon, bills, color }: { title: string; icon: React.ReactNode; bills: CategorizedBill[]; color: string }) => {
    if (bills.length === 0) return null;
    const total = bills.reduce((s, b) => s + (b.category === "due" ? b.total : Number(b.paid_amount || b.total)), 0);
    return (
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              {icon}
              {title}
              <Badge variant="secondary" className="ml-1">{bills.length}</Badge>
            </CardTitle>
            <span className={`text-sm font-bold ${color}`}>Rs {total.toLocaleString()}</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b text-xs">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Invoice</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Customer</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Total</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Paid</th>
                {title.includes("Split") && <th className="px-3 py-2 text-left font-medium text-muted-foreground">Breakdown</th>}
                {title.includes("Due") && <th className="px-3 py-2 text-right font-medium text-muted-foreground">Due</th>}
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Time</th>
              </tr>
            </thead>
            <tbody>
              {bills.map(b => (
                <tr key={b.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">{b.invoice_no || "-"}</td>
                  <td className="px-3 py-2">{b.customer_name || "-"}</td>
                  <td className="px-3 py-2 text-right">Rs {b.total.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-green-600">Rs {Number(b.paid_amount).toLocaleString()}</td>
                  {title.includes("Split") && (
                    <td className="px-3 py-2">
                      {b.methodBreakdown && Object.entries(b.methodBreakdown).map(([m, amt]) => (
                        <Badge key={m} variant="outline" className="mr-1 mb-1 text-xs">
                          {m}: Rs {amt.toLocaleString()}
                        </Badge>
                      ))}
                    </td>
                  )}
                  {title.includes("Due") && (
                    <td className="px-3 py-2 text-right text-destructive font-bold">
                      Rs {(b.total - b.paid_amount).toLocaleString()}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right text-muted-foreground text-xs">
                    {format(new Date(b.created_at), "hh:mm a")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    );
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Daily Cash Report</h1>
          <p className="text-sm text-muted-foreground">{format(selectedDate, "EEEE, MMMM d, yyyy")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
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
          <Button size="sm" onClick={fetchData} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={exportExcel} disabled={bills.length === 0} className="gap-2">
            <Download className="h-4 w-4" /> Excel
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading report...</div>
      ) : (
        <>
          {/* Net Cash Hero */}
          <Card className="mb-6 bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
            <CardContent className="py-6">
              <p className="text-sm font-medium text-muted-foreground mb-1">Net Cash (Income − Expenses)</p>
              <p className={`text-4xl font-bold ${netCash >= 0 ? "text-green-600" : "text-destructive"}`}>
                Rs {netCash.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Total Income: Rs {totalIncome.toLocaleString()} | Total Expenses: Rs {totalExpenses.toLocaleString()}
                {ledgerDebits > 0 && ` | Ledger Debits: Rs ${ledgerDebits.toLocaleString()}`}
              </p>
            </CardContent>
          </Card>

          {/* Method Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Card>
              <CardContent className="py-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                  <Banknote className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cash</p>
                  <p className="text-lg font-bold text-green-600">Rs {methodTotals.cash.toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                  <Smartphone className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">JazzCash</p>
                  <p className="text-lg font-bold text-red-600">Rs {methodTotals.jazzcash.toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">EasyPaisa</p>
                  <p className="text-lg font-bold text-emerald-600">Rs {methodTotals.easypaisa.toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Bank Transfer</p>
                  <p className="text-lg font-bold text-blue-600">Rs {methodTotals.bank.toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Expenses Summary */}
          {expenses.length > 0 && (
            <Card className="mb-6">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">Expenses</CardTitle>
                  <span className="text-sm font-bold text-destructive">Rs {totalExpenses.toLocaleString()}</span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b text-xs">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Description</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Category</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map(e => (
                      <tr key={e.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-3 py-2">{e.description || "-"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{e.category_name || "-"}</td>
                        <td className="px-3 py-2 text-right text-destructive">Rs {e.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Ledger Entries */}
          {ledgerEntries.length > 0 && (
            <Card className="mb-6">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">Ledger Entries</CardTitle>
                  <div className="flex gap-3 text-sm">
                    <span className="text-green-600 font-medium">Credits: Rs {ledgerCredits.toLocaleString()}</span>
                    <span className="text-destructive font-medium">Debits: Rs {ledgerDebits.toLocaleString()}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b text-xs">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Description</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Contact</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Credit</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Debit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerEntries.map(l => (
                      <tr key={l.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-3 py-2">{l.description}</td>
                        <td className="px-3 py-2 text-muted-foreground">{l.contact_name || "-"}</td>
                        <td className="px-3 py-2 text-right text-green-600">{l.credit > 0 ? `Rs ${l.credit.toLocaleString()}` : "-"}</td>
                        <td className="px-3 py-2 text-right text-destructive">{l.debit > 0 ? `Rs ${l.debit.toLocaleString()}` : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Bill Tables by Category */}
          <div className="space-y-4">
            <BillTable title="Cash Bills" icon={<Banknote className="h-4 w-4 text-green-600" />} bills={billsByCategory.cash} color="text-green-600" />
            <BillTable title="JazzCash Bills" icon={<Smartphone className="h-4 w-4 text-red-600" />} bills={billsByCategory.jazzcash} color="text-red-600" />
            <BillTable title="EasyPaisa Bills" icon={<CreditCard className="h-4 w-4 text-emerald-600" />} bills={billsByCategory.easypaisa} color="text-emerald-600" />
            <BillTable title="Bank Transfer Bills" icon={<Building2 className="h-4 w-4 text-blue-600" />} bills={billsByCategory.bank} color="text-blue-600" />
            <BillTable title="Split Payment Bills" icon={<SplitSquareHorizontal className="h-4 w-4 text-purple-600" />} bills={billsByCategory.split} color="text-purple-600" />
            <BillTable title="Unpaid / Due Bills" icon={<AlertCircle className="h-4 w-4 text-destructive" />} bills={billsByCategory.due} color="text-destructive" />
          </div>

          {/* Empty state */}
          {bills.length === 0 && expenses.length === 0 && ledgerEntries.length === 0 && (
            <div className="rounded-lg border border-dashed p-12 text-center mt-6">
              <FileSpreadsheet className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">No transactions found for {format(selectedDate, "MMMM d, yyyy")}.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
