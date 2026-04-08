import { useState, useEffect, useMemo, useRef } from "react";
import { offlineQuery } from "@/lib/offlineQuery";
import { Calendar, Download, FileSpreadsheet, TrendingUp, TrendingDown, DollarSign, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/customClient";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import * as XLSX from "xlsx";

const CHART_COLORS = [
  "hsl(38, 92%, 50%)", "hsl(222, 47%, 11%)", "hsl(142, 71%, 45%)",
  "hsl(0, 72%, 51%)", "hsl(220, 14%, 70%)", "hsl(280, 60%, 50%)",
];

interface DailySummary {
  date: string;
  total_sales: number;
  total_purchases: number;
  total_expenses: number;
  net_profit: number;
  sales_count: number;
  purchases_count: number;
  expenses_count: number;
}

interface MonthGroup {
  month: string; // YYYY-MM
  label: string; // "March 2026"
  days: DailySummary[];
  totalSales: number;
  totalPurchases: number;
  totalExpenses: number;
  totalProfit: number;
}

export default function SummaryPage() {
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);

  const fetchSummaries = async () => {
    setLoading(true);
    try {
      const data = await offlineQuery<DailySummary>("daily_summaries", { order: "date", ascending: false });
      setSummaries(data);
    } catch (e) {
      console.error("Summary fetch error:", e);
      toast.error("Failed to load summaries");
    } finally {
      setLoading(false);
    }
  };

  const syncToday = async () => {
    setSyncing(true);
    try {
      const todayStr = new Date().toISOString().split("T")[0];
      const [{ data: sales }, { data: purchases }, { data: expenses }] = await Promise.all([
        supabase.from("sale_transactions").select("total").eq("date", todayStr),
        supabase.from("purchases").select("total").eq("date", todayStr),
        supabase.from("expenses").select("amount").eq("date", todayStr),
      ]);

      const totalSales = (sales || []).reduce((s, r) => s + Number(r.total || 0), 0);
      const totalPurchases = (purchases || []).reduce((s, r) => s + Number(r.total || 0), 0);
      const totalExpenses = (expenses || []).reduce((s, r) => s + Number(r.amount || 0), 0);

      const record = {
        date: todayStr,
        total_sales: totalSales,
        total_purchases: totalPurchases,
        total_expenses: totalExpenses,
        net_profit: totalSales - totalPurchases - totalExpenses,
        sales_count: sales?.length || 0,
        purchases_count: purchases?.length || 0,
        expenses_count: expenses?.length || 0,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("daily_summaries").upsert(record, { onConflict: "date" });
      if (error) throw error;
      toast.success("Today's summary saved");
      fetchSummaries();
    } catch (e) {
      console.error("Sync error:", e);
      toast.error("Failed to sync today's summary");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchSummaries();
  }, []);

  // Auto-sync today on first load only
  const syncedRef = useRef(false);
  useEffect(() => {
    if (!loading && !syncedRef.current) {
      syncedRef.current = true;
      const todayStr = new Date().toISOString().split("T")[0];
      const hasToday = summaries.some(s => s.date === todayStr);
      if (!hasToday) syncToday();
    }
  }, [loading]);

  const monthGroups = useMemo((): MonthGroup[] => {
    const groups = new Map<string, DailySummary[]>();
    for (const s of summaries) {
      const month = s.date.substring(0, 7);
      if (!groups.has(month)) groups.set(month, []);
      groups.get(month)!.push(s);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, days]) => {
        const [y, m] = month.split("-");
        const date = new Date(Number(y), Number(m) - 1);
        return {
          month,
          label: date.toLocaleString("default", { month: "long", year: "numeric" }),
          days: days.sort((a, b) => b.date.localeCompare(a.date)),
          totalSales: days.reduce((s, d) => s + Number(d.total_sales), 0),
          totalPurchases: days.reduce((s, d) => s + Number(d.total_purchases), 0),
          totalExpenses: days.reduce((s, d) => s + Number(d.total_expenses), 0),
          totalProfit: days.reduce((s, d) => s + Number(d.net_profit), 0),
        };
      });
  }, [summaries]);

  const toggleMonth = (month: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      next.has(month) ? next.delete(month) : next.add(month);
      return next;
    });
  };

  // Chart data: last 30 days
  const chartData = useMemo(() => {
    return [...summaries]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30)
      .map(s => ({
        date: s.date.substring(5),
        Sales: Number(s.total_sales),
        Purchases: Number(s.total_purchases),
        Expenses: Number(s.total_expenses),
        Profit: Number(s.net_profit),
      }));
  }, [summaries]);

  const categoryData = useMemo(() => {
    const totals = summaries.reduce(
      (acc, s) => ({
        sales: acc.sales + Number(s.total_sales),
        purchases: acc.purchases + Number(s.total_purchases),
        expenses: acc.expenses + Number(s.total_expenses),
      }),
      { sales: 0, purchases: 0, expenses: 0 }
    );
    return [
      { name: "Sales", value: totals.sales },
      { name: "Purchases", value: totals.purchases },
      { name: "Expenses", value: totals.expenses },
    ].filter(d => d.value > 0);
  }, [summaries]);

  const exportExcel = () => {
    const rows = summaries.map(s => ({
      Date: s.date,
      "Total Sales": Number(s.total_sales),
      "Total Purchases": Number(s.total_purchases),
      "Total Expenses": Number(s.total_expenses),
      "Net Profit": Number(s.net_profit),
      "Sales Count": s.sales_count,
      "Purchases Count": s.purchases_count,
      "Expenses Count": s.expenses_count,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Daily Summaries");
    XLSX.writeFile(wb, "daily_summaries.xlsx");
    toast.success("Exported to Excel");
  };


  const importExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws);
      let count = 0;
      for (const row of rows) {
        const date = row.Date || row.date;
        if (!date) continue;
        const record = {
          date: String(date),
          total_sales: Number(row["Total Sales"] || row.total_sales || 0),
          total_purchases: Number(row["Total Purchases"] || row.total_purchases || 0),
          total_expenses: Number(row["Total Expenses"] || row.total_expenses || 0),
          net_profit: Number(row["Net Profit"] || row.net_profit || 0),
          sales_count: Number(row["Sales Count"] || row.sales_count || 0),
          purchases_count: Number(row["Purchases Count"] || row.purchases_count || 0),
          expenses_count: Number(row["Expenses Count"] || row.expenses_count || 0),
        };
        await supabase.from("daily_summaries").upsert(record, { onConflict: "date" });
        count++;
      }
      toast.success(`Imported ${count} summary records`);
      fetchSummaries();
    } catch {
      toast.error("Failed to import file");
    }
    e.target.value = "";
  };

  const grandTotal = monthGroups.reduce(
    (acc, g) => ({
      sales: acc.sales + g.totalSales,
      purchases: acc.purchases + g.totalPurchases,
      expenses: acc.expenses + g.totalExpenses,
      profit: acc.profit + g.totalProfit,
    }),
    { sales: 0, purchases: 0, expenses: 0, profit: 0 }
  );

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Monthly Summary</h1>
          <p className="text-sm text-muted-foreground">{summaries.length} daily records across {monthGroups.length} month(s)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={syncToday} disabled={syncing} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> Sync Today
          </Button>
          <label>
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={importExcel} />
            <Button size="sm" variant="outline" className="gap-2" asChild><span><FileSpreadsheet className="h-4 w-4" /> Import</span></Button>
          </label>
          <Button size="sm" variant="outline" onClick={exportExcel} className="gap-2" disabled={summaries.length === 0}>
            <Download className="h-4 w-4" /> Excel
          </Button>
        </div>
      </div>

      {/* Grand Totals */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Sales</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">Rs {grandTotal.sales.toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Purchases</CardTitle>
            <TrendingDown className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-blue-600">Rs {grandTotal.purchases.toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Expenses</CardTitle>
            <DollarSign className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive">Rs {grandTotal.expenses.toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Profit</CardTitle>
            <DollarSign className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${grandTotal.profit >= 0 ? "text-green-600" : "text-destructive"}`}>
              Rs {grandTotal.profit.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      {chartData.length > 1 && (
        <div className="grid gap-6 lg:grid-cols-2 mb-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Daily Profit Trend (Last 30 Days)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <XAxis dataKey="date" fontSize={11} stroke="hsl(220, 9%, 46%)" />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} fontSize={11} stroke="hsl(220, 9%, 46%)" />
                  <Tooltip formatter={(v: number) => [`Rs ${v.toLocaleString()}`, ""]} contentStyle={{ borderRadius: 8, border: "1px solid hsl(220, 13%, 91%)", fontSize: 13 }} />
                  <Line type="monotone" dataKey="Profit" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Sales" stroke="hsl(38, 92%, 50%)" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Overall Breakdown</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={55} outerRadius={100} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={12}>
                    {categoryData.map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [`Rs ${v.toLocaleString()}`, "Amount"]} contentStyle={{ borderRadius: 8, border: "1px solid hsl(220, 13%, 91%)", fontSize: 13 }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Monthly Groups */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : monthGroups.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Calendar className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">No summary records yet. Click "Sync Today" to save today's data.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {monthGroups.map((group) => (
            <motion.div key={group.month} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border overflow-hidden">
              <button
                onClick={() => toggleMonth(group.month)}
                className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {expandedMonths.has(group.month) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <span className="font-semibold text-lg">{group.label}</span>
                  <Badge variant="secondary">{group.days.length} days</Badge>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <span className="text-green-600 font-medium">Sales: Rs {group.totalSales.toLocaleString()}</span>
                  <span className="text-blue-600 font-medium">Purchases: Rs {group.totalPurchases.toLocaleString()}</span>
                  <span className={`font-bold ${group.totalProfit >= 0 ? "text-green-600" : "text-destructive"}`}>
                    Profit: Rs {group.totalProfit.toLocaleString()}
                  </span>
                </div>
              </button>
              {expandedMonths.has(group.month) && (
                <div className="border-t">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">Date</th>
                        <th className="px-4 py-2 text-right font-medium text-muted-foreground">Sales</th>
                        <th className="px-4 py-2 text-right font-medium text-muted-foreground">Purchases</th>
                        <th className="px-4 py-2 text-right font-medium text-muted-foreground">Expenses</th>
                        <th className="px-4 py-2 text-right font-medium text-muted-foreground">Net Profit</th>
                        <th className="px-4 py-2 text-center font-medium text-muted-foreground">Txns</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.days.map((day) => (
                        <tr key={day.date} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="px-4 py-2 font-medium">{day.date}</td>
                          <td className="px-4 py-2 text-right text-green-600">Rs {Number(day.total_sales).toLocaleString()}</td>
                          <td className="px-4 py-2 text-right text-blue-600">Rs {Number(day.total_purchases).toLocaleString()}</td>
                          <td className="px-4 py-2 text-right text-destructive">Rs {Number(day.total_expenses).toLocaleString()}</td>
                          <td className={`px-4 py-2 text-right font-bold ${Number(day.net_profit) >= 0 ? "text-green-600" : "text-destructive"}`}>
                            Rs {Number(day.net_profit).toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-center text-muted-foreground">
                            {day.sales_count + day.purchases_count + day.expenses_count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/50 font-bold border-t">
                        <td className="px-4 py-2">Month Total</td>
                        <td className="px-4 py-2 text-right text-green-600">Rs {group.totalSales.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right text-blue-600">Rs {group.totalPurchases.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right text-destructive">Rs {group.totalExpenses.toLocaleString()}</td>
                        <td className={`px-4 py-2 text-right ${group.totalProfit >= 0 ? "text-green-600" : "text-destructive"}`}>
                          Rs {group.totalProfit.toLocaleString()}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
