import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/customClient";
import { TrendingUp, TrendingDown, DollarSign, Calendar, BarChart3 } from "lucide-react";
import { motion } from "framer-motion";
import { format, subDays, startOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid, Legend } from "recharts";

interface PeriodData {
  sales: number;
  purchases: number;
  expenses: number;
  profit: number;
  margin: number;
  salesCount: number;
}

export default function ProfitCalculatorPage() {
  const [period, setPeriod] = useState<"today" | "week" | "month">("today");
  const [data, setData] = useState<PeriodData>({ sales: 0, purchases: 0, expenses: 0, profit: 0, margin: 0, salesCount: 0 });
  const [dailyData, setDailyData] = useState<{ date: string; sales: number; expenses: number; profit: number }[]>([]);
  const [topProducts, setTopProducts] = useState<{ name: string; revenue: number; cost: number; margin: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const today = new Date();
      let startDate: string;
      if (period === "today") startDate = format(today, "yyyy-MM-dd");
      else if (period === "week") startDate = format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
      else startDate = format(startOfMonth(today), "yyyy-MM-dd");
      const endDate = format(today, "yyyy-MM-dd");

      const [{ data: sales }, { data: purchases }, { data: expenses }, { data: saleItems }] = await Promise.all([
        supabase.from("sale_transactions").select("date, total").gte("date", startDate).lte("date", endDate),
        supabase.from("purchases").select("date, total").gte("date", startDate).lte("date", endDate),
        supabase.from("expenses").select("date, amount").gte("date", startDate).lte("date", endDate),
        supabase.from("sale_items").select("product_name, quantity, unit_price, subtotal, product_id, sale_id").limit(500),
      ]);

      const totalSales = (sales || []).reduce((s, r) => s + Number(r.total || 0), 0);
      const totalPurchases = (purchases || []).reduce((s, r) => s + Number(r.total || 0), 0);
      const totalExpenses = (expenses || []).reduce((s, r) => s + Number(r.amount || 0), 0);
      const profit = totalSales - totalPurchases - totalExpenses;

      setData({
        sales: totalSales,
        purchases: totalPurchases,
        expenses: totalExpenses,
        profit,
        margin: totalSales > 0 ? (profit / totalSales) * 100 : 0,
        salesCount: sales?.length || 0,
      });

      // Daily breakdown for charts
      const dayMap: Record<string, { sales: number; expenses: number; purchases: number }> = {};
      (sales || []).forEach((s) => {
        if (!dayMap[s.date]) dayMap[s.date] = { sales: 0, expenses: 0, purchases: 0 };
        dayMap[s.date].sales += Number(s.total || 0);
      });
      (expenses || []).forEach((e) => {
        if (!dayMap[e.date]) dayMap[e.date] = { sales: 0, expenses: 0, purchases: 0 };
        dayMap[e.date].expenses += Number(e.amount || 0);
      });
      (purchases || []).forEach((p) => {
        if (!dayMap[p.date]) dayMap[p.date] = { sales: 0, expenses: 0, purchases: 0 };
        dayMap[p.date].purchases += Number(p.total || 0);
      });
      const dailyArr = Object.entries(dayMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, d]) => ({ date: format(new Date(date), "dd MMM"), sales: d.sales, expenses: d.expenses + d.purchases, profit: d.sales - d.expenses - d.purchases }));
      setDailyData(dailyArr);

      // Top products by revenue
      const productMap: Record<string, { name: string; revenue: number; qty: number }> = {};
      (saleItems || []).forEach((item: any) => {
        const key = item.product_name;
        if (!productMap[key]) productMap[key] = { name: key, revenue: 0, qty: 0 };
        productMap[key].revenue += Number(item.subtotal || 0);
        productMap[key].qty += Number(item.quantity || 0);
      });
      setTopProducts(
        Object.values(productMap)
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 8)
          .map((p) => ({ name: p.name, revenue: p.revenue, cost: 0, margin: 0 }))
      );
    } catch (e) {
      console.error("Profit calc error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [period]);

  if (loading) return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Profit Calculator</h1>
          <p className="text-muted-foreground">Track your margins and profitability</p>
        </div>
        <div className="flex gap-2">
          {(["today", "week", "month"] as const).map((p) => (
            <Button key={p} variant={period === p ? "default" : "outline"} size="sm" onClick={() => setPeriod(p)} className="capitalize">{p === "today" ? "Today" : p === "week" ? "This Week" : "This Month"}</Button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm text-muted-foreground">Revenue</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">Rs {data.sales.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">{data.salesCount} sales</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm text-muted-foreground">Costs</CardTitle>
              <TrendingDown className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">Rs {(data.purchases + data.expenses).toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Purchases + Expenses</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm text-muted-foreground">Net Profit</CardTitle>
              <DollarSign className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${data.profit >= 0 ? "text-green-600" : "text-destructive"}`}>Rs {data.profit.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">After all costs</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm text-muted-foreground">Profit Margin</CardTitle>
              <BarChart3 className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${data.margin >= 0 ? "text-green-600" : "text-destructive"}`}>{data.margin.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">Revenue margin</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {dailyData.length > 1 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Daily Profit Trend</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(v: number) => [`Rs ${v.toLocaleString()}`, ""]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Legend />
                  <Line type="monotone" dataKey="sales" stroke="hsl(142, 71%, 45%)" strokeWidth={2} name="Sales" />
                  <Line type="monotone" dataKey="expenses" stroke="hsl(0, 72%, 51%)" strokeWidth={2} name="Costs" />
                  <Line type="monotone" dataKey="profit" stroke="hsl(38, 92%, 50%)" strokeWidth={2} name="Profit" dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {topProducts.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Top Products by Revenue</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topProducts} layout="vertical">
                  <XAxis type="number" fontSize={11} />
                  <YAxis type="category" dataKey="name" width={120} fontSize={11} tick={{ fill: "hsl(var(--foreground))" }} />
                  <Tooltip formatter={(v: number) => [`Rs ${v.toLocaleString()}`, "Revenue"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="revenue" fill="hsl(38, 92%, 50%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Breakdown Table */}
      <Card className="mt-6">
        <CardHeader><CardTitle className="text-sm">Period Breakdown</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b"><span className="text-muted-foreground">Total Sales Revenue</span><span className="font-bold text-green-600">Rs {data.sales.toLocaleString()}</span></div>
            <div className="flex justify-between py-2 border-b"><span className="text-muted-foreground">Less: Purchases</span><span className="font-bold text-destructive">- Rs {data.purchases.toLocaleString()}</span></div>
            <div className="flex justify-between py-2 border-b"><span className="text-muted-foreground">Less: Expenses</span><span className="font-bold text-destructive">- Rs {data.expenses.toLocaleString()}</span></div>
            <div className="flex justify-between py-2 border-b font-bold text-base"><span>Gross Profit</span><span className={data.sales - data.purchases >= 0 ? "text-green-600" : "text-destructive"}>Rs {(data.sales - data.purchases).toLocaleString()}</span></div>
            <div className="flex justify-between py-2 font-bold text-lg"><span>Net Profit</span><span className={data.profit >= 0 ? "text-green-600" : "text-destructive"}>Rs {data.profit.toLocaleString()}</span></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
