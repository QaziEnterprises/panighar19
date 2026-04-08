import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Package, TrendingUp, AlertTriangle, ShoppingCart, Receipt, DollarSign,
  Users, Boxes, Clock, CreditCard, ArrowRight, Sparkles, BarChart3, Wallet,
  FileText, BookOpen, Plus, Printer, ListTodo, CheckCircle2, Circle,
  Smartphone, Landmark, Banknote, PieChart,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/customClient";
import { retryQuery } from "@/lib/retryFetch";
import { offlineQuery } from "@/lib/offlineQuery";
import { motion } from "framer-motion";
import PaymentRemindersWidget from "@/components/PaymentRemindersWidget";
import DailySalesSummary from "@/components/DailySalesSummary";

interface TodaySummary {
  todaySales: number;
  todayPurchases: number;
  todayExpenses: number;
  todayProfit: number;
  todaySalesCount: number;
  todayPurchasesCount: number;
  todayExpensesCount: number;
  todayJC: number;
  todayEP: number;
  todayBT: number;
  todayCash: number;
}

interface RecentSale {
  id: string;
  invoice_no: string | null;
  total: number;
  payment_method: string | null;
  date: string;
  customer_type: string | null;
  created_at: string;
}

interface TopDebtor {
  id: string;
  name: string;
  current_balance: number;
}


const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const [lowStockProducts, setLowStockProducts] = useState<{ id: string; name: string; quantity: number; alert_threshold: number; purchase_price: number }[]>([]);
  const [today, setToday] = useState<TodaySummary>({ todaySales: 0, todayPurchases: 0, todayExpenses: 0, todayProfit: 0, todaySalesCount: 0, todayPurchasesCount: 0, todayExpensesCount: 0, todayJC: 0, todayEP: 0, todayBT: 0, todayCash: 0 });
  const [inventoryValue, setInventoryValue] = useState(0);
  const [totalProducts, setTotalProducts] = useState(0);
  const [totalContacts, setTotalContacts] = useState(0);
  const [pendingPayments, setPendingPayments] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [topDebtors, setTopDebtors] = useState<TopDebtor[]>([]);
  const [todos, setTodos] = useState<{ id: string; title: string; completed: boolean; priority: string | null }[]>([]);
  const [newTodo, setNewTodo] = useState("");


  useEffect(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    
    const fetchData = async () => {
      try {
        const [
          allSales,
          allPurchases,
          allExpenses,
          products,
          contacts,
          pendingSalesData,
          recent,
          debtors,
        ] = await Promise.all([
          offlineQuery<any>("sale_transactions", { order: "created_at", ascending: false }),
          offlineQuery<any>("purchases", { order: "date", ascending: false }),
          offlineQuery<any>("expenses", { order: "date", ascending: false }),
          offlineQuery<any>("products"),
          offlineQuery<any>("contacts"),
          offlineQuery<any>("sale_transactions", { filter: (s: any) => s.payment_status === "due" || s.payment_status === "partial" }),
          offlineQuery<any>("sale_transactions", { order: "created_at", ascending: false, limit: 8 }),
          offlineQuery<any>("contacts", { filter: (c: any) => Number(c.current_balance || 0) > 0, order: "current_balance", ascending: false, limit: 5 }),
        ]);

        const todaySales = allSales.filter((s: any) => s.date === todayStr);
        const todayPurchases = allPurchases.filter((p: any) => p.date === todayStr);
        const todayExpenses = allExpenses.filter((e: any) => e.date === todayStr);

        const salesTotal = (todaySales || []).reduce((s, r) => s + Number(r.total || 0), 0);
        const purchTotal = (todayPurchases || []).reduce((s, r) => s + Number(r.total || 0), 0);
        const expTotal = (todayExpenses || []).reduce((s, r) => s + Number(r.amount || 0), 0);

        const todayJC = (todaySales || []).filter(r => r.payment_method === 'jazzcash').reduce((s, r) => s + Number(r.total || 0), 0);
        const todayEP = (todaySales || []).filter(r => r.payment_method === 'easypaisa').reduce((s, r) => s + Number(r.total || 0), 0);
        const todayBT = (todaySales || []).filter(r => r.payment_method === 'bank').reduce((s, r) => s + Number(r.total || 0), 0);
        const todayCash = (todaySales || []).filter(r => r.payment_method === 'cash').reduce((s, r) => s + Number(r.total || 0), 0);

        setToday({
          todaySales: salesTotal, todayPurchases: purchTotal, todayExpenses: expTotal,
          todayProfit: salesTotal - purchTotal - expTotal,
          todaySalesCount: todaySales?.length || 0, todayPurchasesCount: todayPurchases?.length || 0, todayExpensesCount: todayExpenses?.length || 0,
          todayJC, todayEP, todayBT, todayCash,
        });

        const allProducts = products || [];
        setTotalProducts(allProducts.length);
        setInventoryValue(allProducts.reduce((s: number, p: any) => s + (Number(p.purchase_price || 0) * Number(p.quantity || 0)), 0));
        setTotalContacts(contacts.length);
        setPendingPayments(pendingSalesData.reduce((s: number, r: any) => s + (Number(r.total || 0) - Number(r.paid_amount || 0)), 0));
        setPendingCount(pendingSalesData.length);
        setRecentSales((recent || []).map((r: any) => ({ id: r.id, invoice_no: r.invoice_no, total: Number(r.total || 0), payment_method: r.payment_method, date: r.date, customer_type: r.customer_type, created_at: r.created_at })));
        setTopDebtors((debtors || []).map((d: any) => ({ id: d.id, name: d.name, current_balance: Number(d.current_balance || 0) })));

        setLowStockProducts(
          allProducts
            .filter((p: any) => p.alert_threshold && p.alert_threshold > 0 && (p.quantity || 0) <= p.alert_threshold)
            .map((p: any) => ({ id: p.id, name: p.name, quantity: p.quantity || 0, alert_threshold: p.alert_threshold || 0, purchase_price: p.purchase_price || 0 }))
        );

      } catch (e) {
        console.error("Dashboard fetch error:", e);
      }
    };
    fetchData();
  }, []);

  // Fetch todos
  useEffect(() => {
    const fetchTodos = async () => {
      const { data } = await supabase.from("todos").select("id, title, completed, priority").order("created_at", { ascending: false }).limit(10);
      setTodos((data || []).map((t: any) => ({ id: t.id, title: t.title, completed: t.completed, priority: t.priority })));
    };
    fetchTodos();
  }, []);

  const addTodo = async () => {
    if (!newTodo.trim()) return;
    const { data: userData } = await supabase.auth.getUser();
    const { data } = await supabase.from("todos").insert({ title: newTodo.trim(), created_by: userData.user?.id }).select().single();
    if (data) setTodos(prev => [{ id: data.id, title: data.title, completed: data.completed, priority: data.priority }, ...prev]);
    setNewTodo("");
  };

  const toggleTodo = async (id: string, completed: boolean) => {
    await supabase.from("todos").update({ completed: !completed }).eq("id", id);
    setTodos(prev => prev.map(t => t.id === id ? { ...t, completed: !completed } : t));
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good Morning";
    if (h < 17) return "Good Afternoon";
    return "Good Evening";
  };

  const formattedDate = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const formatTime = (createdAt: string) => {
    try {
      return new Date(createdAt).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Karachi" });
    } catch { return ""; }
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      {/* Hero Greeting Banner */}
      <motion.div variants={item} className="dashboard-greeting">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-5 w-5 text-accent" />
            <span className="text-sm font-medium opacity-80">{formattedDate}</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">{greeting()}, Welcome Back!</h1>
          <p className="mt-1 text-sm opacity-70">Here's how your business is performing today.</p>
          
          {/* Quick summary pills */}
          <div className="flex flex-wrap gap-2 mt-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-medium backdrop-blur-sm">
              <TrendingUp className="h-3 w-3" /> PKR {today.todaySales.toLocaleString()} sales
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-medium backdrop-blur-sm">
              <ShoppingCart className="h-3 w-3" /> {today.todaySalesCount} orders
            </span>
            {today.todayProfit !== 0 && (
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium backdrop-blur-sm ${today.todayProfit >= 0 ? "bg-success/20" : "bg-destructive/20"}`}>
                <DollarSign className="h-3 w-3" /> PKR {today.todayProfit.toLocaleString()} profit
              </span>
            )}
          </div>
        </div>
      </motion.div>

      {/* Quick Actions Bar */}
      <motion.div variants={item} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "New Sale", icon: Plus, path: "/pos", color: "bg-success/10 text-success" },
          { label: "Add Expense", icon: Receipt, path: "/expenses", color: "bg-destructive/10 text-destructive" },
          { label: "New Purchase", icon: ShoppingCart, path: "/purchases", color: "bg-info/10 text-info" },
          { label: "View Reports", icon: BarChart3, path: "/reports", color: "bg-accent/10 text-accent" },
        ].map((a) => (
          <Button
            key={a.label}
            variant="outline"
            className="h-auto py-3 flex flex-col items-center gap-1.5 hover:scale-[1.02] transition-transform"
            onClick={() => navigate(a.path)}
          >
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${a.color}`}>
              <a.icon className="h-4 w-4" />
            </div>
            <span className="text-xs font-medium">{a.label}</span>
          </Button>
        ))}
      </motion.div>

      {/* Today's Stats Grid */}
      <motion.div variants={item}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Sales Card */}
          <div className="stat-card group">
            <div className="stat-card-glow bg-success" />
            <div className="relative p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="stat-card-icon bg-success/10">
                  <TrendingUp className="h-5 w-5 text-success" />
                </div>
                <Badge variant="outline" className="text-[10px] font-normal border-success/30 text-success">
                  {today.todaySalesCount} txn
                </Badge>
              </div>
              <p className="text-sm font-medium text-muted-foreground">Today's Sales</p>
              <p className="text-2xl font-bold mt-1 text-success animate-count-up">
                PKR {today.todaySales.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Purchases Card */}
          <div className="stat-card group">
            <div className="stat-card-glow bg-info" />
            <div className="relative p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="stat-card-icon bg-info/10">
                  <ShoppingCart className="h-5 w-5 text-info" />
                </div>
                <Badge variant="outline" className="text-[10px] font-normal border-info/30 text-info">
                  {today.todayPurchasesCount} orders
                </Badge>
              </div>
              <p className="text-sm font-medium text-muted-foreground">Today's Purchases</p>
              <p className="text-2xl font-bold mt-1 text-info animate-count-up" style={{ animationDelay: "0.1s" }}>
                PKR {today.todayPurchases.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Expenses Card */}
          <div className="stat-card group">
            <div className="stat-card-glow bg-destructive" />
            <div className="relative p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="stat-card-icon bg-destructive/10">
                  <Receipt className="h-5 w-5 text-destructive" />
                </div>
                <Badge variant="outline" className="text-[10px] font-normal border-destructive/30 text-destructive">
                  {today.todayExpensesCount} items
                </Badge>
              </div>
              <p className="text-sm font-medium text-muted-foreground">Today's Expenses</p>
              <p className="text-2xl font-bold mt-1 text-destructive animate-count-up" style={{ animationDelay: "0.2s" }}>
                PKR {today.todayExpenses.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Profit Card - Featured */}
          <div className={`stat-card group ring-1 ${today.todayProfit >= 0 ? "ring-success/30" : "ring-destructive/30"}`}>
            <div className={`stat-card-glow ${today.todayProfit >= 0 ? "bg-success" : "bg-destructive"}`} style={{ opacity: 0.15 }} />
            <div className={`absolute inset-0 ${today.todayProfit >= 0 ? "bg-gradient-to-br from-success/5 to-transparent" : "bg-gradient-to-br from-destructive/5 to-transparent"}`} />
            <div className="relative p-5">
              <div className="flex items-center justify-between mb-3">
                <div className={`stat-card-icon ${today.todayProfit >= 0 ? "bg-success/15" : "bg-destructive/15"}`}>
                  <DollarSign className={`h-5 w-5 ${today.todayProfit >= 0 ? "text-success" : "text-destructive"}`} />
                </div>
                <Badge variant="outline" className={`text-[10px] font-semibold ${today.todayProfit >= 0 ? "profit-badge-positive" : "profit-badge-negative"}`}>
                  {today.todaySales > 0 ? `${((today.todayProfit / today.todaySales) * 100).toFixed(1)}%` : "—"}
                </Badge>
              </div>
              <p className="text-sm font-medium text-muted-foreground">Net Profit</p>
              <p className={`text-3xl font-bold mt-1 animate-count-up ${today.todayProfit >= 0 ? "text-success" : "text-destructive"}`} style={{ animationDelay: "0.3s" }}>
                PKR {today.todayProfit.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Payment Method Breakdown */}
      {today.todaySales > 0 && (
        <motion.div variants={item}>
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <PieChart className="h-4 w-4 text-accent" /> Today's Payment Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Cash", value: today.todayCash, icon: Banknote, color: "text-success" },
                  { label: "Bank Transfer", value: today.todayBT, icon: Landmark, color: "text-info" },
                  { label: "JazzCash", value: today.todayJC, icon: Smartphone, color: "text-destructive" },
                  { label: "EasyPaisa", value: today.todayEP, icon: CreditCard, color: "text-warning" },
                ].map((pm) => (
                  <div key={pm.label} className="rounded-lg border p-3 text-center">
                    <pm.icon className={`h-4 w-4 mx-auto mb-1 ${pm.color}`} />
                    <p className="text-lg font-bold tabular-nums">{pm.value > 0 ? `PKR ${pm.value.toLocaleString()}` : "—"}</p>
                    <p className="text-[10px] text-muted-foreground">{pm.label}</p>
                    {today.todaySales > 0 && pm.value > 0 && (
                      <Progress value={(pm.value / today.todaySales) * 100} className="h-1 mt-1.5" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Business Overview Tiles */}
      <motion.div variants={item} className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <div className="quick-action" onClick={() => navigate("/products-db")}>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
            <Boxes className="h-5 w-5 text-accent" />
          </div>
          <div>
            <p className="text-2xl font-bold">{totalProducts}</p>
            <p className="text-xs text-muted-foreground">Total Products</p>
          </div>
        </div>
        <div className="quick-action" onClick={() => navigate("/contacts")}>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-info/10">
            <Users className="h-5 w-5 text-info" />
          </div>
          <div>
            <p className="text-2xl font-bold">{totalContacts}</p>
            <p className="text-xs text-muted-foreground">Contacts</p>
          </div>
        </div>
        <div className="quick-action" onClick={() => navigate("/bills?status=due")}>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/10">
            <Wallet className="h-5 w-5 text-warning" />
          </div>
          <div>
            <p className="text-xl font-bold text-warning">PKR {pendingPayments.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{pendingCount} Pending Bills</p>
          </div>
        </div>
        <div className="quick-action" onClick={() => navigate("/products-db")}>
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${lowStockProducts.length > 0 ? "bg-destructive/10" : "bg-success/10"}`}>
            <AlertTriangle className={`h-5 w-5 ${lowStockProducts.length > 0 ? "text-destructive" : "text-success"}`} />
          </div>
          <div>
            <p className={`text-2xl font-bold ${lowStockProducts.length > 0 ? "text-destructive" : "text-success"}`}>{lowStockProducts.length}</p>
            <p className="text-xs text-muted-foreground">Low Stock Items</p>
          </div>
        </div>
        <div className="quick-action" onClick={() => navigate("/products-db")}>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xl font-bold text-primary">PKR {inventoryValue.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Inventory Value</p>
          </div>
        </div>
      </motion.div>

      {/* Cash in Hand Summary */}
      <motion.div variants={item}>
        <Card className="glass-card border-success/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Banknote className="h-4 w-4 text-success" /> Today's Cash in Hand
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-success">{today.todayCash > 0 ? `PKR ${today.todayCash.toLocaleString()}` : "—"}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Cash Sales</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-info">{(today.todayBT + today.todayJC + today.todayEP) > 0 ? `PKR ${(today.todayBT + today.todayJC + today.todayEP).toLocaleString()}` : "—"}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Digital Received</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-warning">{pendingPayments > 0 ? `PKR ${pendingPayments.toLocaleString()}` : "—"}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Credit Given (Udhar)</p>
              </div>
              <div className="text-center">
                <p className={`text-2xl font-bold ${today.todayCash - today.todayExpenses >= 0 ? "text-success" : "text-destructive"}`}>
                  PKR {(today.todayCash - today.todayExpenses).toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">Net Cash (after expenses)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>


      {/* Top Debtors + Recent Sales */}
      <motion.div variants={item} className="grid gap-4 lg:grid-cols-2">
        {/* Top Debtors */}
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-warning" /> Top Debtors
            </CardTitle>
            <Link to="/ledger">
              <Button variant="ghost" size="sm" className="text-xs h-7 gap-1">
                View Ledger <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {topDebtors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="rounded-full bg-muted p-3 mb-3">
                  <DollarSign className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No outstanding debts</p>
              </div>
            ) : (
              <div className="space-y-2">
                {topDebtors.map((d, i) => (
                  <motion.div
                    key={d.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.3 }}
                    className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold
                        ${i === 0 ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"}`}>
                        #{i + 1}
                      </div>
                      <span className="font-medium truncate">{d.name}</span>
                    </div>
                    <span className="font-bold text-destructive tabular-nums">PKR {d.current_balance.toLocaleString()}</span>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Sales */}
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-accent" /> Recent Sales
            </CardTitle>
            <Link to="/bills">
              <Button variant="ghost" size="sm" className="text-xs h-7 gap-1">
                View All <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentSales.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="rounded-full bg-muted p-3 mb-3">
                  <Receipt className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No sales recorded yet</p>
                <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={() => navigate("/pos")}>
                  Create First Sale
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {recentSales.map((s, i) => (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.3 }}
                    className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <span className="font-medium block truncate">{s.invoice_no || "No Invoice"}</span>
                      <span className="text-xs text-muted-foreground">{s.date} · {formatTime(s.created_at)}</span>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2">
                      <span className="font-semibold">PKR {s.total.toLocaleString()}</span>
                      <Badge variant="outline" className="text-[10px] capitalize">{s.payment_method || "cash"}</Badge>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Daily Sales Summary with PDF Download */}
      <motion.div variants={item}>
        <DailySalesSummary />
      </motion.div>

      {/* Payment Reminders */}
      <motion.div variants={item}>
        <PaymentRemindersWidget />
      </motion.div>

      {/* Quick To-Do List */}
      <motion.div variants={item}>
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-accent" /> Quick Tasks
            </CardTitle>
            <Badge variant="outline" className="text-[10px]">
              {todos.filter(t => !t.completed).length} pending
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-3">
              <Input
                placeholder="Add a quick task..."
                value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTodo()}
                className="h-8 text-sm"
              />
              <Button size="sm" className="h-8 px-3" onClick={addTodo}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {todos.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No tasks yet. Add one above!</p>
              ) : (
                todos.map((t) => (
                  <div
                    key={t.id}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50 ${t.completed ? "opacity-50" : ""}`}
                  >
                    <Checkbox checked={t.completed} onCheckedChange={() => toggleTodo(t.id, t.completed)} />
                    <span className={`flex-1 truncate ${t.completed ? "line-through text-muted-foreground" : ""}`}>{t.title}</span>
                    {t.priority === "high" && <Badge variant="destructive" className="text-[9px] h-4">High</Badge>}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Low Stock Alerts */}
      {lowStockProducts.length > 0 && (
        <motion.div variants={item}>
          <div className="rounded-xl border-2 border-dashed border-destructive/30 bg-destructive/5 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/15">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Low Stock Alert</h3>
                  <p className="text-xs text-muted-foreground">{lowStockProducts.length} product(s) need restocking</p>
                </div>
              </div>
              <Link to="/products-db">
                <Button variant="outline" size="sm" className="text-xs">View Products</Button>
              </Link>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {lowStockProducts.slice(0, 6).map((p) => {
                const reorderQty = Math.max(p.alert_threshold * 2 - p.quantity, p.alert_threshold);
                return (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm gap-2 transition-colors hover:bg-muted/30">
                    <div className="min-w-0">
                      <span className="font-medium block truncate">{p.name}</span>
                      <span className="text-xs text-muted-foreground">
                        Stock: <span className="text-destructive font-semibold">{p.quantity}</span> / Min: {p.alert_threshold}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs flex-shrink-0 h-7 border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => navigate(`/purchases?reorder=${p.id}&product=${encodeURIComponent(p.name)}&qty=${reorderQty}&price=${p.purchase_price}`)}
                    >
                      <ShoppingCart className="h-3 w-3 mr-1" /> Reorder
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
