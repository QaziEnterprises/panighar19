import { useState, useEffect, useRef } from "react";
import { Banknote, CreditCard, Clock, TrendingUp, RefreshCw, Printer, Trash2, Pencil, Check, X, Plus, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/customClient";
import { retryQuery } from "@/lib/retryFetch";
import { toast } from "sonner";

interface DailySummaryData {
  totalSales: number;
  salesCount: number;
  cashSales: number;
  bankSales: number;
  jazzCashSales: number;
  easyPaisaSales: number;
  creditSales: number;
  paidSales: number;
  partialSales: number;
  dueSales: number;
  totalPurchases: number;
  totalExpenses: number;
  purchasesCount: number;
  expensesCount: number;
}

interface SaleBill {
  id: string;
  invoice_no: string | null;
  total: number;
  payment_method: string | null;
  payment_status: string | null;
  customer_name: string | null;
  customer_id: string | null;
  date: string;
  items: { product_name: string | null; quantity: number; unit_price: number; subtotal: number }[];
}

interface ExpenseRow {
  id: string;
  amount: number;
  description: string | null;
  payment_method: string | null;
  reference_no: string | null;
}

export default function DailySalesSummary() {
  const [summary, setSummary] = useState<DailySummaryData>({
    totalSales: 0, salesCount: 0, cashSales: 0, bankSales: 0,
    jazzCashSales: 0, easyPaisaSales: 0, creditSales: 0,
    paidSales: 0, partialSales: 0, dueSales: 0,
    totalPurchases: 0, totalExpenses: 0, purchasesCount: 0, expensesCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [deletingDuplicates, setDeletingDuplicates] = useState(false);
  const [expensesList, setExpensesList] = useState<ExpenseRow[]>([]);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editExpenseAmt, setEditExpenseAmt] = useState("");
  const [editExpenseDesc, setEditExpenseDesc] = useState("");

  const getTodayStr = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const todayStr = getTodayStr();
      const [{ data: sales }, { data: purchases }, { data: expensesData }] = await Promise.all([
        retryQuery(() => supabase.from("sale_transactions").select("total, payment_method, payment_status").eq("date", todayStr)),
        retryQuery(() => supabase.from("purchases").select("total").eq("date", todayStr)),
        retryQuery(() => supabase.from("expenses").select("id, amount, description, payment_method, reference_no").eq("date", todayStr)),
      ]);

      const allSales = (sales as any[]) || [];
      const allPurchases = (purchases as any[]) || [];
      const allExpenses = (expensesData as any[]) || [];

      // Store full expenses list
      setExpensesList(allExpenses.map((e: any) => ({
        id: e.id,
        amount: Number(e.amount || 0),
        description: e.description,
        payment_method: e.payment_method,
        reference_no: e.reference_no,
      })));

      const totalSales = allSales.reduce((s: number, r: any) => s + Number(r.total || 0), 0);
      const totalPurchases = allPurchases.reduce((s: number, r: any) => s + Number(r.total || 0), 0);
      const totalExpenses = allExpenses.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

      const cashSales = allSales.filter((r: any) => r.payment_method === "cash" && r.payment_status === "paid")
        .reduce((s: number, r: any) => s + Number(r.total || 0), 0);
      const bankSales = allSales.filter((r: any) => r.payment_method === "bank" && r.payment_status === "paid")
        .reduce((s: number, r: any) => s + Number(r.total || 0), 0);
      const jazzCashSales = allSales.filter((r: any) => r.payment_method === "jazzcash" && r.payment_status === "paid")
        .reduce((s: number, r: any) => s + Number(r.total || 0), 0);
      const easyPaisaSales = allSales.filter((r: any) => r.payment_method === "easypaisa" && r.payment_status === "paid")
        .reduce((s: number, r: any) => s + Number(r.total || 0), 0);

      const paidSales = allSales.filter((r: any) => r.payment_status === "paid")
        .reduce((s: number, r: any) => s + Number(r.total || 0), 0);
      const dueSales = allSales.filter((r: any) => r.payment_status === "due")
        .reduce((s: number, r: any) => s + Number(r.total || 0), 0);
      const partialSales = allSales.filter((r: any) => r.payment_status === "partial")
        .reduce((s: number, r: any) => s + Number(r.total || 0), 0);
      const creditSales = dueSales + partialSales;

      setSummary({
        totalSales, salesCount: allSales.length,
        cashSales, bankSales, jazzCashSales, easyPaisaSales,
        creditSales, paidSales, partialSales, dueSales,
        totalPurchases, totalExpenses,
        purchasesCount: allPurchases.length, expensesCount: allExpenses.length,
      });
      setLastUpdated(new Date());
    } catch (e) {
      console.error("Daily summary fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleEditExpense = (exp: ExpenseRow) => {
    setEditingExpenseId(exp.id);
    setEditExpenseAmt(exp.amount.toString());
    setEditExpenseDesc(exp.description || "");
  };

  const handleSaveExpense = async (id: string) => {
    const amt = parseFloat(editExpenseAmt);
    if (isNaN(amt) || amt < 0) { toast.error("Invalid amount"); return; }
    const { error } = await supabase.from("expenses").update({ amount: amt, description: editExpenseDesc || null }).eq("id", id);
    if (error) { toast.error("Failed to update"); return; }
    toast.success("Expense updated");
    setEditingExpenseId(null);
    fetchSummary();
  };

  const handleDeleteExpense = async (id: string, amount: number) => {
    if (!confirm(`Delete this expense (PKR ${amount.toLocaleString()})?`)) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) { toast.error("Failed to delete"); return; }
    toast.success("Expense deleted");
    fetchSummary();
  };

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(fetchSummary, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Delete duplicate bills: same customer_id, date, total, and same products
  const handleDeleteDuplicates = async () => {
    setDeletingDuplicates(true);
    try {
      const todayStr = getTodayStr();
      const { data: sales } = await supabase
        .from("sale_transactions")
        .select("id, customer_id, total, date")
        .eq("date", todayStr);

      if (!sales || sales.length < 2) {
        toast.info("No duplicates found");
        setDeletingDuplicates(false);
        return;
      }

      // Get all sale items for today's sales
      const saleIds = sales.map(s => s.id);
      const { data: allItems } = await supabase
        .from("sale_items")
        .select("sale_id, product_id, product_name, quantity, unit_price")
        .in("sale_id", saleIds);

      const itemsBySale = new Map<string, string>();
      for (const sale of sales) {
        const saleItems = (allItems || [])
          .filter(i => i.sale_id === sale.id)
          .sort((a, b) => (a.product_id || a.product_name || "").localeCompare(b.product_id || b.product_name || ""))
          .map(i => `${i.product_id || i.product_name}|${i.quantity}|${i.unit_price}`)
          .join(";;");
        itemsBySale.set(sale.id, saleItems);
      }

      // Group by customer_id + total + items fingerprint
      const groups = new Map<string, string[]>();
      for (const sale of sales) {
        const key = `${sale.customer_id || "walk-in"}|${sale.total}|${itemsBySale.get(sale.id) || ""}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(sale.id);
      }

      const duplicateIds: string[] = [];
      for (const [, ids] of groups) {
        if (ids.length > 1) {
          // Keep the first, delete the rest
          duplicateIds.push(...ids.slice(1));
        }
      }

      if (duplicateIds.length === 0) {
        toast.info("No duplicates found");
        setDeletingDuplicates(false);
        return;
      }

      if (!confirm(`Found ${duplicateIds.length} duplicate bill(s). Delete them?`)) {
        setDeletingDuplicates(false);
        return;
      }

      // Delete items first, then sales
      await supabase.from("sale_items").delete().in("sale_id", duplicateIds);
      const { error } = await supabase.from("sale_transactions").delete().in("id", duplicateIds);
      if (error) throw error;

      toast.success(`Deleted ${duplicateIds.length} duplicate bill(s)`);
      fetchSummary();
    } catch (e) {
      console.error("Delete duplicates error:", e);
      toast.error("Failed to delete duplicates");
    } finally {
      setDeletingDuplicates(false);
    }
  };

  const buildSummaryHtml = async () => {
    const todayStr = getTodayStr();
    const todayDisplay = new Date().toLocaleDateString("en-PK", {
      weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Karachi"
    });
    const timeStr = new Date().toLocaleTimeString("en-PK", {
      hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Karachi"
    });

    const [{ data: salesRaw }, { data: contacts }, { data: saleItems }, { data: expensesRaw }] = await Promise.all([
      supabase.from("sale_transactions").select("id, invoice_no, total, payment_method, payment_status, customer_id, date").eq("date", todayStr),
      supabase.from("contacts").select("id, name"),
      supabase.from("sale_items").select("sale_id, product_name, quantity, unit_price, subtotal"),
      supabase.from("expenses").select("id, amount, description, payment_method, reference_no").eq("date", todayStr),
    ]);

    const contactMap = new Map((contacts || []).map(c => [c.id, c.name]));
    const itemsMap = new Map<string, typeof saleItems>();
    for (const item of (saleItems || [])) {
      if (!itemsMap.has(item.sale_id)) itemsMap.set(item.sale_id, []);
      itemsMap.get(item.sale_id)!.push(item);
    }

    const bills: SaleBill[] = (salesRaw || []).map(s => ({
      id: s.id, invoice_no: s.invoice_no, total: Number(s.total || 0),
      payment_method: s.payment_method, payment_status: s.payment_status,
      customer_name: s.customer_id ? (contactMap.get(s.customer_id) || "Unknown") : "Walk-in",
      customer_id: s.customer_id, date: s.date,
      items: (itemsMap.get(s.id) || []).map(i => ({ product_name: i.product_name, quantity: Number(i.quantity), unit_price: Number(i.unit_price), subtotal: Number(i.subtotal) })),
    }));

    const expenses: ExpenseRow[] = (expensesRaw || []).map(e => ({
      id: e.id, amount: Number(e.amount || 0), description: e.description, payment_method: e.payment_method, reference_no: e.reference_no,
    }));

    const paymentMethods = [
      { key: "cash", label: "💵 Cash Bills", shade: "#fff" },
      { key: "bank", label: "🏦 Bank Transfer Bills", shade: "#e8e8e8" },
      { key: "jazzcash", label: "📱 JazzCash Bills", shade: "#d0d0d0" },
      { key: "easypaisa", label: "📲 EasyPaisa Bills", shade: "#ddd" },
    ];

    const creditBills = bills.filter(b => b.payment_status === "due" || b.payment_status === "partial");
    const netProfit = summary.totalSales - summary.totalPurchases - summary.totalExpenses;
    const totalExpensesAmt = expenses.reduce((s, e) => s + e.amount, 0);

    const buildBillTable = (billList: SaleBill[], shade: string) => {
      if (billList.length === 0) return `<p style="color:#888;font-style:italic;margin:4px 0 12px;">No bills</p>`;
      let html = `<table><thead><tr><th>#</th><th>Invoice</th><th>Customer</th><th>Products</th><th class="text-right">Amount (PKR)</th></tr></thead><tbody>`;
      billList.forEach((b, i) => {
        const products = b.items.map(it => `${it.product_name || "Item"} x${it.quantity}`).join(", ") || "—";
        html += `<tr style="background:${shade}"><td>${i + 1}</td><td>${b.invoice_no || "—"}</td><td>${b.customer_name}</td><td style="font-size:10px;max-width:200px;word-wrap:break-word;">${products}</td><td class="text-right bold">PKR ${b.total.toLocaleString()}</td></tr>`;
      });
      html += `</tbody></table>`;
      return html;
    };

    let billSectionsHtml = "";
    for (const pm of paymentMethods) {
      const filtered = bills.filter(b => b.payment_method === pm.key && b.payment_status === "paid");
      billSectionsHtml += `<p class="section-title">${pm.label}</p>`;
      billSectionsHtml += buildBillTable(filtered, pm.shade);
    }
    billSectionsHtml += `<p class="section-title">📋 Credit / Udhar Bills</p>`;
    billSectionsHtml += buildBillTable(creditBills, "#b8b8b8");

    const knownMethods = new Set(["cash", "bank", "jazzcash", "easypaisa"]);
    const otherBills = bills.filter(b => b.payment_status === "paid" && !knownMethods.has(b.payment_method || ""));
    if (otherBills.length > 0) {
      billSectionsHtml += `<p class="section-title">🔖 Other Payment Method Bills</p>`;
      billSectionsHtml += buildBillTable(otherBills, "#c8c8c8");
    }

    let expensesHtml = `<p class="section-title">💰 Today's Expenses</p>`;
    if (expenses.length === 0) {
      expensesHtml += `<p style="color:#888;font-style:italic;margin:4px 0 12px;">No expenses today</p>`;
    } else {
      expensesHtml += `<table><thead><tr><th>#</th><th>Description</th><th>Payment</th><th>Ref</th><th class="text-right">Amount (PKR)</th></tr></thead><tbody>`;
      expenses.forEach((e, i) => {
        expensesHtml += `<tr><td>${i + 1}</td><td>${e.description || "—"}</td><td>${e.payment_method || "—"}</td><td>${e.reference_no || "—"}</td><td class="text-right bold">PKR ${e.amount.toLocaleString()}</td></tr>`;
      });
      expensesHtml += `</tbody><tfoot><tr style="background:#000;color:#fff;"><td colspan="4" class="bold">Total Expenses (${expenses.length})</td><td class="text-right bold">PKR ${totalExpensesAmt.toLocaleString()}</td></tr></tfoot></table>`;
    }

    const styles = `* { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; font-size: 12px; color: #000; }
      h1 { text-align: center; font-size: 18px; margin-bottom: 4px; }
      .tagline { text-align: center; font-size: 12px; color: #333; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 6px; }
      .header-divider { width: 60%; margin: 8px auto; border-top: 2px solid #000; border-bottom: 1px solid #000; padding-top: 2px; }
      .subtitle { text-align: center; font-size: 11px; color: #555; margin-bottom: 2px; }
      .subtitle:last-of-type { margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th, td { border: 1px solid #000; padding: 5px 8px; text-align: left; font-size: 11px; }
      th { font-weight: 700; font-size: 10px; text-transform: uppercase; background: #f0f0f0; }
      .text-right { text-align: right; } .text-center { text-align: center; } .bold { font-weight: 700; }
      .section-title { font-size: 13px; font-weight: 700; margin: 16px 0 8px; border-bottom: 2px solid #000; padding-bottom: 4px; }
      .grand-total { background: #000; color: #fff; font-size: 13px; }
      .footer { text-align: center; margin-top: 20px; font-size: 10px; color: #888; border-top: 1px dashed #999; padding-top: 8px; }
      @media print { body { padding: 0; } }`;

    const body = `<h1>Qazi Enterprises</h1>
      <p class="tagline">Wholesale & Retail — Building Materials & General Store</p>
      <div class="header-divider"></div>
      <p class="subtitle">📊 Daily Summary Report</p>
      <p class="subtitle">${todayDisplay} · Generated at ${timeStr}</p>
      <p class="section-title">Overview</p>
      <table><thead><tr><th>Category</th><th class="text-center">Count</th><th class="text-right">Amount (PKR)</th></tr></thead><tbody>
        <tr><td class="bold">Total Sales</td><td class="text-center">${summary.salesCount}</td><td class="text-right bold">PKR ${summary.totalSales.toLocaleString()}</td></tr>
        <tr><td class="bold">Total Purchases</td><td class="text-center">${summary.purchasesCount}</td><td class="text-right bold">PKR ${summary.totalPurchases.toLocaleString()}</td></tr>
        <tr><td class="bold">Total Expenses</td><td class="text-center">${summary.expensesCount}</td><td class="text-right bold">PKR ${summary.totalExpenses.toLocaleString()}</td></tr>
        <tr class="grand-total"><td class="bold" colspan="2">Net Profit / Loss</td><td class="text-right bold">PKR ${netProfit.toLocaleString()}</td></tr>
      </tbody></table>
      ${billSectionsHtml}
      ${expensesHtml}
      <p class="section-title">End of Day Closing</p>
      <table><tbody>
        <tr style="background:#fff;"><td class="bold">Cash in Hand</td><td class="text-right bold">PKR ${summary.cashSales.toLocaleString()}</td></tr>
        <tr style="background:#e8e8e8;"><td class="bold">Bank Transfer</td><td class="text-right bold">PKR ${summary.bankSales.toLocaleString()}</td></tr>
        <tr style="background:#d0d0d0;"><td class="bold">JazzCash</td><td class="text-right bold">PKR ${summary.jazzCashSales.toLocaleString()}</td></tr>
        <tr style="background:#ddd;"><td class="bold">EasyPaisa</td><td class="text-right bold">PKR ${summary.easyPaisaSales.toLocaleString()}</td></tr>
        <tr style="background:#b8b8b8;"><td class="bold">Credit Given (Udhar)</td><td class="text-right bold">PKR ${summary.creditSales.toLocaleString()}</td></tr>
        <tr class="grand-total"><td class="bold">Total Day Sales</td><td class="text-right bold">PKR ${summary.totalSales.toLocaleString()}</td></tr>
      </tbody></table>
      <div class="footer"><p>Generated at ${timeStr} — Qazi Enterprises</p></div>`;

    return { styles, body, todayDisplay };
  };

  const handlePrint = async () => {
    const { styles, body } = await buildSummaryHtml();
    const printWindow = window.open("", "_blank");
    if (!printWindow) { toast.error("Please allow popups to print"); return; }
    printWindow.document.write(`<html><head><title>Daily Summary</title><style>${styles}</style></head><body>${body}<script>window.onload = function() { window.print(); window.close(); }<\/script></body></html>`);
    printWindow.document.close();
  };

  const handleDownload = async () => {
    const { styles, body } = await buildSummaryHtml();
    const todayStr = getTodayStr();
    toast.info("Generating PDF, please wait...");

    // Create a visible but off-screen container for html2canvas
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.left = "0";
    container.style.top = "0";
    container.style.width = "794px";
    container.style.background = "#fff";
    container.style.padding = "20px";
    container.style.fontFamily = "'Segoe UI', Arial, sans-serif";
    container.style.fontSize = "12px";
    container.style.color = "#000";
    container.style.zIndex = "-9999";
    container.style.overflow = "hidden";
    container.innerHTML = `<style>${styles}</style>${body}`;
    document.body.appendChild(container);
    // Let the browser render
    await new Promise(r => setTimeout(r, 300));

    try {
      const { default: html2canvas } = await import("html2canvas");
      const { default: jsPDF } = await import("jspdf");

      const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/jpeg", 0.95);

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position -= pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      pdf.save(`Daily_Summary_${todayStr}.pdf`);
      toast.success("PDF downloaded successfully!");
    } catch (err) {
      console.error("PDF generation error:", err);
      toast.error("Failed to generate PDF");
    } finally {
      document.body.removeChild(container);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Daily Sales Summary
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">
              Updated: {lastUpdated.toLocaleTimeString("en-PK", { timeZone: "Asia/Karachi" })}
            </span>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleDeleteDuplicates} disabled={deletingDuplicates} title="Delete Duplicate Bills">
              <Trash2 className="h-3 w-3" />
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handlePrint} title="Print Summary">
              <Printer className="h-3 w-3" />
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleDownload} title="Download as PDF">
              <Download className="h-3 w-3" />
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={fetchSummary} disabled={loading}>
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Net Cash Received (Cash - Expenses) */}
        <div className="text-center p-3 rounded-lg bg-accent/10 border-2 border-accent/30">
          <p className="text-xs text-muted-foreground mb-1 font-semibold uppercase tracking-wider">💰 Net Cash in Hand</p>
          <p className={`text-3xl font-bold ${(summary.cashSales - summary.totalExpenses) >= 0 ? "text-primary" : "text-destructive"}`}>
            PKR {(summary.cashSales - summary.totalExpenses).toLocaleString()}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">Cash Received (PKR {summary.cashSales.toLocaleString()}) − Expenses (PKR {summary.totalExpenses.toLocaleString()})</p>
        </div>

        {/* Total */}
        <div className="text-center p-3 rounded-lg bg-primary/5 border">
          <p className="text-xs text-muted-foreground mb-1">Today's Total Sales</p>
          <p className="text-3xl font-bold text-primary">PKR {summary.totalSales.toLocaleString()}</p>
          <Badge variant="secondary" className="mt-1 text-[10px]">{summary.salesCount} transactions</Badge>
        </div>

        {/* Payment Method Breakdown */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">By Payment Method</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center justify-between p-2 rounded-lg border bg-card">
              <div className="flex items-center gap-2">
                <Banknote className="h-4 w-4 text-foreground" />
                <span className="text-xs">Cash</span>
              </div>
              <span className="text-sm font-bold">PKR {summary.cashSales.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg border bg-muted/50">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-foreground" />
                <span className="text-xs">Bank</span>
              </div>
              <span className="text-sm font-bold">PKR {summary.bankSales.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold w-4 text-center">JC</span>
                <span className="text-xs">JazzCash</span>
              </div>
              <span className="text-sm font-bold">PKR {summary.jazzCashSales.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg border bg-muted/40">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold w-4 text-center">EP</span>
                <span className="text-xs">EasyPaisa</span>
              </div>
              <span className="text-sm font-bold">PKR {summary.easyPaisaSales.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Payment Status Breakdown */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">By Payment Status</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-primary" />
                <span className="text-sm">Paid (Collected)</span>
              </div>
              <span className="text-sm font-bold">PKR {summary.paidSales.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                <span className="text-sm">Credit / Due (Udhar)</span>
              </div>
              <span className="text-sm font-bold">PKR {summary.creditSales.toLocaleString()}</span>
            </div>
            {summary.dueSales > 0 && (
              <div className="flex items-center justify-between pl-4">
                <span className="text-xs text-muted-foreground">└ Full Due</span>
                <span className="text-xs font-medium">PKR {summary.dueSales.toLocaleString()}</span>
              </div>
            )}
            {summary.partialSales > 0 && (
              <div className="flex items-center justify-between pl-4">
                <span className="text-xs text-muted-foreground">└ Partial</span>
                <span className="text-xs font-medium">PKR {summary.partialSales.toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Today's Expenses with Edit/Delete */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">💰 Today's Expenses ({expensesList.length})</p>
          {expensesList.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No expenses today</p>
          ) : (
            <div className="space-y-1.5">
              {expensesList.map((exp) => (
                <div key={exp.id} className="flex items-center justify-between rounded-lg border p-2 gap-2 text-xs">
                  {editingExpenseId === exp.id ? (
                    <>
                      <div className="flex-1 flex gap-1">
                        <Input value={editExpenseDesc} onChange={(e) => setEditExpenseDesc(e.target.value)} className="h-7 text-xs" placeholder="Description" />
                        <Input type="number" value={editExpenseAmt} onChange={(e) => setEditExpenseAmt(e.target.value)} className="h-7 text-xs w-24" />
                      </div>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleSaveExpense(exp.id)}><Check className="h-3 w-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingExpenseId(null)}><X className="h-3 w-3" /></Button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium">{exp.description || "No description"}</p>
                        {exp.payment_method && <p className="text-muted-foreground capitalize">{exp.payment_method}</p>}
                      </div>
                      <span className="font-bold whitespace-nowrap">PKR {exp.amount.toLocaleString()}</span>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleEditExpense(exp)}><Pencil className="h-3 w-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => handleDeleteExpense(exp.id, exp.amount)}><Trash2 className="h-3 w-3" /></Button>
                    </>
                  )}
                </div>
              ))}
              <div className="flex justify-between p-2 rounded-lg bg-destructive/10 border border-destructive/20">
                <span className="text-xs font-semibold">Total Expenses</span>
                <span className="text-xs font-bold text-destructive">PKR {summary.totalExpenses.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>

        <Separator />


        <div className="rounded-lg border-2 border-dashed p-3 space-y-1">
          <p className="text-xs font-semibold flex items-center gap-1">
            <Clock className="h-3 w-3" /> End of Day Closing
          </p>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Cash in Hand:</span>
            <span className="font-bold">PKR {summary.cashSales.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Bank Received:</span>
            <span className="font-bold">PKR {(summary.bankSales + summary.jazzCashSales + summary.easyPaisaSales).toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Credit Given:</span>
            <span className="font-bold">PKR {summary.creditSales.toLocaleString()}</span>
          </div>
          <Separator />
          <div className="flex justify-between text-sm font-bold">
            <span>Total Day Sales:</span>
            <span className="text-primary">PKR {summary.totalSales.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Purchases:</span>
            <span className="font-bold">PKR {summary.totalPurchases.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Expenses:</span>
            <span className="font-bold">PKR {summary.totalExpenses.toLocaleString()}</span>
          </div>
          <Separator />
          <div className="flex justify-between text-sm font-bold">
            <span>Net Profit:</span>
            <span className={summary.totalSales - summary.totalPurchases - summary.totalExpenses >= 0 ? "text-primary" : "text-destructive"}>
              PKR {(summary.totalSales - summary.totalPurchases - summary.totalExpenses).toLocaleString()}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
