import React, { useState, useEffect, useCallback, useMemo } from "react";
import { offlineQuery } from "@/lib/offlineQuery";
import { CalendarDays, TrendingUp, TrendingDown, DollarSign, ShoppingCart, Receipt, Download, Printer, FileDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/customClient";
import { motion } from "framer-motion";
import { exportToExcel } from "@/lib/exportUtils";
import { toast } from "sonner";
import DayTransactionsDialog from "@/components/reports/DayTransactionsDialog";
import DailyTrendChart from "@/components/reports/DailyTrendChart";

interface DailySummary {
  date: string;
  totalSales: number;
  totalPurchases: number;
  totalExpenses: number;
  profit: number;
  salesCount: number;
  purchasesCount: number;
  expensesCount: number;
}

interface InvoiceDetail {
  id: string;
  invoice_no: string | null;
  customer_name: string;
  total: number;
  payment_method: string;
  payment_status: string;
}

export default function ReportsPage() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [invoiceDetails, setInvoiceDetails] = useState<Record<string, InvoiceDetail[]>>({});

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [sales, purchases, expenses] = await Promise.all([
          offlineQuery<any>("sale_transactions", { order: "date", ascending: false }),
          offlineQuery<any>("purchases", { order: "date", ascending: false }),
          offlineQuery<any>("expenses", { order: "date", ascending: false }),
        ]);

        // Filter by date range client-side (works offline too)
        const filteredSales = sales.filter(s => s.date >= startDate && s.date <= endDate);
        const filteredPurchases = purchases.filter(p => p.date >= startDate && p.date <= endDate);
        const filteredExpenses = expenses.filter(e => e.date >= startDate && e.date <= endDate);

        const dateMap = new Map<string, DailySummary>();
        const getOrCreate = (date: string): DailySummary => {
          if (!dateMap.has(date)) dateMap.set(date, { date, totalSales: 0, totalPurchases: 0, totalExpenses: 0, profit: 0, salesCount: 0, purchasesCount: 0, expensesCount: 0 });
          return dateMap.get(date)!;
        };

        filteredSales.forEach((s) => { const d = getOrCreate(s.date); d.totalSales += Number(s.total || 0); d.salesCount++; });
        filteredPurchases.forEach((p) => { const d = getOrCreate(p.date); d.totalPurchases += Number(p.total || 0); d.purchasesCount++; });
        filteredExpenses.forEach((e) => { const d = getOrCreate(e.date); d.totalExpenses += Number(e.amount || 0); d.expensesCount++; });

        dateMap.forEach((d) => { d.profit = d.totalSales - d.totalPurchases - d.totalExpenses; });

        const sorted = Array.from(dateMap.values()).sort((a, b) => b.date.localeCompare(a.date));
        setSummaries(sorted);
      } catch (e) {
        console.error("Reports fetch error:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [startDate, endDate, refreshKey]);

  const totals = summaries.reduce(
    (acc, d) => ({
      sales: acc.sales + d.totalSales,
      purchases: acc.purchases + d.totalPurchases,
      expenses: acc.expenses + d.totalExpenses,
      profit: acc.profit + d.profit,
    }),
    { sales: 0, purchases: 0, expenses: 0, profit: 0 }
  );

  const handleDataChanged = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const toggleDateExpand = async (date: string) => {
    if (expandedDate === date) { setExpandedDate(null); return; }
    setExpandedDate(date);
    if (!invoiceDetails[date]) {
      const [{ data: salesData }, { data: contacts }] = await Promise.all([
        supabase.from("sale_transactions").select("id, invoice_no, customer_id, total, payment_method, payment_status").eq("date", date).order("created_at", { ascending: false }),
        supabase.from("contacts").select("id, name").eq("type", "customer"),
      ]);
      const contactMap: Record<string, string> = {};
      (contacts || []).forEach((c: any) => { contactMap[c.id] = c.name; });
      const details = (salesData || []).map((s: any) => ({
        id: s.id,
        invoice_no: s.invoice_no,
        customer_name: s.customer_id ? (contactMap[s.customer_id] || "Walk-in") : "Walk-in",
        total: Number(s.total || 0),
        payment_method: s.payment_method || "cash",
        payment_status: s.payment_status || "paid",
      }));
      setInvoiceDetails(prev => ({ ...prev, [date]: details }));
    }
  };

  const handlePrintDaySummary = async (date: string) => {
    const day = summaries.find(s => s.date === date);
    if (!day) return;

    const dateDisplay = new Date(date + "T00:00:00").toLocaleDateString("en-PK", {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    });
    const timeStr = new Date().toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", hour12: true });

    // Fetch full data: sales with items, contacts, expenses
    const [{ data: salesRaw }, { data: contacts }, { data: saleItems }, { data: expensesRaw }] = await Promise.all([
      supabase.from("sale_transactions").select("id, invoice_no, total, paid_amount, payment_method, payment_status, customer_id, date").eq("date", date),
      supabase.from("contacts").select("id, name"),
      supabase.from("sale_items").select("sale_id, product_name, quantity, unit_price, subtotal"),
      supabase.from("expenses").select("id, amount, description, payment_method, reference_no").eq("date", date),
    ]);

    const contactMap = new Map((contacts || []).map(c => [c.id, c.name]));
    const itemsMap = new Map<string, any[]>();
    for (const item of (saleItems || [])) {
      if (!itemsMap.has(item.sale_id)) itemsMap.set(item.sale_id, []);
      itemsMap.get(item.sale_id)!.push(item);
    }

    const bills = (salesRaw || []).map(s => ({
      id: s.id,
      invoice_no: s.invoice_no,
      total: Number(s.total || 0),
      paid_amount: Number(s.paid_amount || 0),
      payment_method: s.payment_method,
      payment_status: s.payment_status,
      customer_name: s.customer_id ? (contactMap.get(s.customer_id) || "Unknown") : "Walk-in",
      items: (itemsMap.get(s.id) || []).map(i => ({
        product_name: i.product_name,
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
        subtotal: Number(i.subtotal),
      })),
    }));

    const expenses = (expensesRaw || []).map(e => ({
      amount: Number(e.amount || 0),
      description: e.description,
      payment_method: e.payment_method,
      reference_no: e.reference_no,
    }));

    // Parse split payment methods like "cash:2000, bank:36000"
    const parsePaymentBreakdown = (pm: string | null): Record<string, number> => {
      if (!pm) return { cash: 0 };
      const result: Record<string, number> = {};
      if (pm.includes(":") && pm.includes(",")) {
        // Split payment: "cash:2000, bank:36000"
        pm.split(",").forEach(part => {
          const [method, amount] = part.trim().split(":");
          if (method && amount) result[method.trim().toLowerCase()] = Number(amount.trim()) || 0;
        });
      } else if (pm.includes(":") && !pm.includes(",")) {
        // Single with amount: "cash:5000"
        const [method, amount] = pm.split(":");
        result[method.trim().toLowerCase()] = Number(amount.trim()) || 0;
      } else {
        // Simple: "cash"
        result[pm.trim().toLowerCase()] = 0; // will use bill total
      }
      return result;
    };

    // Add parsed breakdown to each bill
    const billsWithBreakdown = bills.map(b => {
      const breakdown = parsePaymentBreakdown(b.payment_method);
      // If simple method (no amounts in breakdown), set amount to paid_amount or total
      const hasAmounts = Object.values(breakdown).some(v => v > 0);
      if (!hasAmounts && Object.keys(breakdown).length === 1) {
        const method = Object.keys(breakdown)[0];
        // For "due" bills with no paid_amount, nothing was received
        if (b.payment_status === "due" && b.paid_amount === 0) {
          breakdown[method] = 0;
        } else if (b.paid_amount > 0) {
          breakdown[method] = b.paid_amount;
        } else {
          // "paid" status but paid_amount not filled → assume total was received
          breakdown[method] = b.total;
        }
      }
      return { ...b, breakdown };
    });

    // Build bill table HTML - clean & attractive, now shows payment breakdown per bill
    const buildBillTable = (billList: typeof billsWithBreakdown, accentColor: string, methodKey?: string) => {
      if (billList.length === 0) return `<div class="empty-section">No bills in this category</div>`;
      let html = `<table><thead><tr><th style="width:30px">#</th><th>Customer</th><th>Products</th><th style="width:80px" class="text-right">Bill</th><th style="width:100px" class="text-right">Payment Detail</th><th style="width:80px" class="text-right">Due</th></tr></thead><tbody>`;
      billList.forEach((b, i) => {
        const products = b.items.map(it => `${it.product_name || "Item"} ×${it.quantity}`).join(" · ") || "—";
        const due = b.total - b.paid_amount;
        // Show full payment breakdown
        const breakdownParts = Object.entries(b.breakdown)
          .filter(([_, amt]) => amt > 0)
          .map(([m, amt]) => `<span style="text-transform:capitalize;font-size:10px">${m}: Rs ${amt.toLocaleString()}</span>`)
          .join("<br>");
        const payDetail = breakdownParts || `<span style="font-size:10px">Rs ${b.paid_amount.toLocaleString()}</span>`;
        html += `<tr><td>${i + 1}</td><td class="bold">${b.customer_name}</td><td class="products-cell">${products}</td><td class="text-right">Rs ${b.total.toLocaleString()}</td><td class="text-right" style="color:#2d7d46">${payDetail}</td><td class="text-right" style="color:${due > 0 ? '#c0392b' : '#888'}">${due > 0 ? 'Rs ' + due.toLocaleString() : '—'}</td></tr>`;
      });
      html += `</tbody></table>`;
      return html;
    };

    const paymentMethods = [
      { key: "cash", label: "💵 Cash", accent: "#2d7d46" },
      { key: "bank", label: "🏦 Bank Transfer", accent: "#1a5276" },
      { key: "jazzcash", label: "📱 JazzCash", accent: "#c0392b" },
      { key: "easypaisa", label: "📲 EasyPaisa", accent: "#27ae60" },
    ];

    // A bill belongs to a method section if it has that method in its breakdown OR is the sole method
    let billSectionsHtml = "";
    for (const pm of paymentMethods) {
      const filtered = billsWithBreakdown.filter(b => {
        if (b.payment_status !== "paid") return false;
        return pm.key in b.breakdown;
      });
      if (filtered.length > 0) {
        const methodTotal = filtered.reduce((s, b) => s + (b.breakdown[pm.key] || 0), 0);
        billSectionsHtml += `<div class="section-block"><p class="section-title">${pm.label} <span style="float:right;font-size:11px;color:#555">Received: Rs ${methodTotal.toLocaleString()}</span></p>`;
        billSectionsHtml += buildBillTable(filtered, pm.accent, pm.key);
        billSectionsHtml += `</div>`;
      }
    }

    const creditBills = billsWithBreakdown.filter(b => b.payment_status === "due" || b.payment_status === "partial");
    if (creditBills.length > 0) {
      billSectionsHtml += `<div class="section-block"><p class="section-title">📋 Credit / Udhar</p>`;
      billSectionsHtml += buildBillTable(creditBills, "#e67e22");
      billSectionsHtml += `</div>`;
    }

    const knownMethods = new Set(["cash", "bank", "jazzcash", "easypaisa"]);
    const otherBills = billsWithBreakdown.filter(b => {
      if (b.payment_status !== "paid") return false;
      return !Object.keys(b.breakdown).some(m => knownMethods.has(m));
    });
    if (otherBills.length > 0) {
      billSectionsHtml += `<div class="section-block"><p class="section-title">🔖 Other</p>`;
      billSectionsHtml += buildBillTable(otherBills, "#7f8c8d");
      billSectionsHtml += `</div>`;
    }

    // Calculate accurate totals from breakdowns
    const cashTotal = billsWithBreakdown.filter(b => b.payment_status === "paid").reduce((s, b) => s + (b.breakdown["cash"] || 0), 0);
    const bankTotal = billsWithBreakdown.filter(b => b.payment_status === "paid").reduce((s, b) => s + (b.breakdown["bank"] || 0), 0);
    const jcTotal = billsWithBreakdown.filter(b => b.payment_status === "paid").reduce((s, b) => s + (b.breakdown["jazzcash"] || 0), 0);
    const epTotal = billsWithBreakdown.filter(b => b.payment_status === "paid").reduce((s, b) => s + (b.breakdown["easypaisa"] || 0), 0);
    const creditTotal = creditBills.reduce((s, b) => s + b.total, 0);
    const totalBilled = bills.reduce((s, b) => s + b.total, 0);
    const totalReceived = cashTotal + bankTotal + jcTotal + epTotal;
    const creditPaid = creditBills.reduce((s, b) => s + b.paid_amount, 0);
    // Add credit partial payments broken down
    const creditCash = creditBills.reduce((s, b) => s + (b.breakdown["cash"] || 0), 0);
    const creditBank = creditBills.reduce((s, b) => s + (b.breakdown["bank"] || 0), 0);
    const creditJc = creditBills.reduce((s, b) => s + (b.breakdown["jazzcash"] || 0), 0);
    const creditEp = creditBills.reduce((s, b) => s + (b.breakdown["easypaisa"] || 0), 0);
    const grandCash = cashTotal + creditCash;
    const grandBank = bankTotal + creditBank;
    const grandJc = jcTotal + creditJc;
    const grandEp = epTotal + creditEp;
    const grandReceived = grandCash + grandBank + grandJc + grandEp;
    const totalDue = totalBilled - grandReceived;

    // Expenses section
    const totalExpensesAmt = expenses.reduce((s, e) => s + e.amount, 0);
    let expensesHtml = "";
    if (expenses.length > 0) {
      expensesHtml = `<div class="section-block"><p class="section-title">💰 Expenses</p><table><thead><tr><th style="width:30px">#</th><th>Description</th><th>Method</th><th style="width:100px" class="text-right">Amount</th></tr></thead><tbody>`;
      expenses.forEach((e, i) => {
        expensesHtml += `<tr><td>${i + 1}</td><td>${e.description || "—"}</td><td style="text-transform:capitalize">${e.payment_method || "—"}</td><td class="text-right bold">Rs ${e.amount.toLocaleString()}</td></tr>`;
      });
      expensesHtml += `</tbody><tfoot><tr class="section-total" style="background:#c0392b;color:#fff;"><td colspan="3" class="bold">Total Expenses (${expenses.length})</td><td class="text-right bold">Rs ${totalExpensesAmt.toLocaleString()}</td></tr></tfoot></table></div>`;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) { toast.error("Please allow popups"); return; }
    printWindow.document.write(`<html><head><title>Summary - ${date}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; padding: 24px 28px; font-size: 12px; color: #222; }
      .header { text-align: center; margin-bottom: 20px; }
      .header h1 { font-size: 22px; font-weight: 800; letter-spacing: 1px; margin-bottom: 2px; }
      .header .tagline { font-size: 10px; color: #666; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 8px; }
      .header .date-line { font-size: 13px; font-weight: 600; color: #333; background: #f4f4f4; display: inline-block; padding: 4px 16px; border-radius: 4px; }
      .divider { border: none; border-top: 2px solid #222; margin: 16px 0; }
      .overview-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
      .overview-card { border: 1px solid #ddd; border-radius: 6px; padding: 10px 14px; }
      .overview-card .label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1px; }
      .overview-card .value { font-size: 18px; font-weight: 700; margin-top: 2px; }
      .overview-card.highlight { background: #222; color: #fff; border-color: #222; }
      .overview-card.highlight .label { color: #aaa; }
      .section-block { margin-bottom: 18px; }
      .section-title { font-size: 13px; font-weight: 700; margin-bottom: 6px; padding: 4px 8px; background: #f8f8f8; border-left: 4px solid #333; border-radius: 2px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 5px 8px; text-align: left; font-size: 11px; border-bottom: 1px solid #e0e0e0; }
      th { font-weight: 600; font-size: 9px; text-transform: uppercase; color: #888; border-bottom: 2px solid #ccc; }
      .text-right { text-align: right; }
      .bold { font-weight: 700; }
      .products-cell { font-size: 10px; color: #555; max-width: 220px; }
      .section-total td { font-size: 12px; border: none; padding: 6px 8px; }
      .empty-section { color: #aaa; font-style: italic; font-size: 11px; padding: 6px 0; }
      .closing-table { margin-top: 10px; }
      .closing-table td { padding: 6px 10px; border-bottom: 1px solid #eee; }
      .closing-table .method-icon { font-size: 14px; margin-right: 6px; }
      .closing-table .grand { background: #222; color: #fff; font-size: 13px; font-weight: 700; border: none; }
      .footer { text-align: center; margin-top: 24px; font-size: 9px; color: #aaa; border-top: 1px dashed #ccc; padding-top: 8px; }
      @media print { body { padding: 12px 16px; } }
    </style></head><body>
      <div class="header">
        <h1>QAZI ENTERPRISES</h1>
        <p class="tagline">Building Materials & General Store</p>
        <span class="date-line">📊 ${dateDisplay}</span>
      </div>
      <hr class="divider">

      <div class="overview-grid">
        <div class="overview-card highlight" style="grid-column:span 2;background:#1a5276;border-color:#1a5276"><div class="label">💰 Net Cash in Hand (Cash − Expenses)</div><div class="value" style="color:${(grandCash - totalExpensesAmt) >= 0 ? '#2ecc71' : '#e74c3c'}">Rs ${(grandCash - totalExpensesAmt).toLocaleString()}</div></div>
        <div class="overview-card"><div class="label">Total Billed (${day.salesCount} bills)</div><div class="value" style="color:#222">Rs ${totalBilled.toLocaleString()}</div></div>
        <div class="overview-card"><div class="label">Total Received</div><div class="value" style="color:#2d7d46">Rs ${grandReceived.toLocaleString()}</div></div>
        <div class="overview-card"><div class="label">Outstanding / Due</div><div class="value" style="color:#e67e22">Rs ${totalDue.toLocaleString()}</div></div>
        <div class="overview-card"><div class="label">Expenses (${day.expensesCount})</div><div class="value" style="color:#c0392b">Rs ${day.totalExpenses.toLocaleString()}</div></div>
        <div class="overview-card highlight" style="grid-column:span 2"><div class="label">Net Revenue (Received − Expenses)</div><div class="value" style="color:${(grandReceived - day.totalExpenses) >= 0 ? '#2ecc71' : '#e74c3c'}">Rs ${(grandReceived - day.totalExpenses).toLocaleString()}</div></div>
      </div>

      ${billSectionsHtml}
      ${expensesHtml}

      <div class="section-block">
        <p class="section-title">📋 Payment Collection Summary</p>
        <table class="closing-table">
          <thead><tr><th>Payment Method</th><th class="text-right">Amount Received</th></tr></thead>
          <tbody>
            ${grandCash > 0 ? `<tr><td><span class="method-icon">💵</span> Cash</td><td class="text-right bold">Rs ${grandCash.toLocaleString()}</td></tr>` : ''}
            ${grandBank > 0 ? `<tr><td><span class="method-icon">🏦</span> Bank Transfer</td><td class="text-right bold">Rs ${grandBank.toLocaleString()}</td></tr>` : ''}
            ${grandJc > 0 ? `<tr><td><span class="method-icon">📱</span> JazzCash</td><td class="text-right bold">Rs ${grandJc.toLocaleString()}</td></tr>` : ''}
            ${grandEp > 0 ? `<tr><td><span class="method-icon">📲</span> EasyPaisa</td><td class="text-right bold">Rs ${grandEp.toLocaleString()}</td></tr>` : ''}
            <tr class="grand"><td>Total Received</td><td class="text-right">Rs ${grandReceived.toLocaleString()}</td></tr>
            ${totalDue > 0 ? `<tr style="background:#fff3e0;"><td class="bold" style="color:#e67e22">⏳ Remaining Due / Udhar</td><td class="text-right bold" style="color:#e67e22">Rs ${totalDue.toLocaleString()}</td></tr>` : ''}
            <tr style="background:#333;color:#fff;font-size:13px;font-weight:700;"><td>Total Billed</td><td class="text-right">Rs ${totalBilled.toLocaleString()}</td></tr>
          </tbody>
        </table>
      </div>

      <div class="footer">Qazi Enterprises — Panighar · Generated at ${timeStr}</div>
      <script>window.onload = function() { window.print(); window.close(); }<\/script>
    </body></html>`);
    printWindow.document.close();
  };

  const handleDownloadDaySummary = async (date: string) => {
    const day = summaries.find(s => s.date === date);
    if (!day) return;

    const dateDisplay = new Date(date + "T00:00:00").toLocaleDateString("en-PK", {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    });
    const timeStr = new Date().toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", hour12: true });

    const [{ data: salesRaw }, { data: contacts }, { data: saleItems }, { data: expensesRaw }] = await Promise.all([
      supabase.from("sale_transactions").select("id, invoice_no, total, paid_amount, payment_method, payment_status, customer_id, date").eq("date", date),
      supabase.from("contacts").select("id, name"),
      supabase.from("sale_items").select("sale_id, product_name, quantity, unit_price, subtotal"),
      supabase.from("expenses").select("id, amount, description, payment_method, reference_no").eq("date", date),
    ]);

    const contactMap = new Map((contacts || []).map(c => [c.id, c.name]));
    const itemsMap = new Map<string, any[]>();
    for (const item of (saleItems || [])) {
      if (!itemsMap.has(item.sale_id)) itemsMap.set(item.sale_id, []);
      itemsMap.get(item.sale_id)!.push(item);
    }

    const bills = (salesRaw || []).map(s => ({
      id: s.id,
      invoice_no: s.invoice_no,
      total: Number(s.total || 0),
      paid_amount: Number(s.paid_amount || 0),
      payment_method: s.payment_method,
      payment_status: s.payment_status,
      customer_name: s.customer_id ? (contactMap.get(s.customer_id) || "Unknown") : "Walk-in",
      items: (itemsMap.get(s.id) || []).map(i => ({
        product_name: i.product_name,
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
        subtotal: Number(i.subtotal),
      })),
    }));

    const parsePaymentBreakdown = (pm: string | null): Record<string, number> => {
      if (!pm) return { cash: 0 };
      const result: Record<string, number> = {};
      if (pm.includes(":") && pm.includes(",")) {
        pm.split(",").forEach(part => {
          const [method, amount] = part.trim().split(":");
          if (method && amount) result[method.trim().toLowerCase()] = Number(amount.trim()) || 0;
        });
      } else if (pm.includes(":") && !pm.includes(",")) {
        const [method, amount] = pm.split(":");
        result[method.trim().toLowerCase()] = Number(amount.trim()) || 0;
      } else {
        result[pm.trim().toLowerCase()] = 0;
      }
      return result;
    };

    const billsWithBreakdown = bills.map(b => {
      const breakdown = parsePaymentBreakdown(b.payment_method);
      const hasAmounts = Object.values(breakdown).some(v => v > 0);
      if (!hasAmounts && Object.keys(breakdown).length === 1) {
        const method = Object.keys(breakdown)[0];
        if (b.payment_status === "due" && b.paid_amount === 0) {
          breakdown[method] = 0;
        } else if (b.paid_amount > 0) {
          breakdown[method] = b.paid_amount;
        } else {
          breakdown[method] = b.total;
        }
      }
      return { ...b, breakdown };
    });

    const expenses = (expensesRaw || []).map(e => ({
      amount: Number(e.amount || 0),
      description: e.description,
      payment_method: e.payment_method,
      reference_no: e.reference_no,
    }));

    const buildBillTable = (billList: typeof billsWithBreakdown) => {
      if (billList.length === 0) return `<div style="color:#aaa;font-style:italic;font-size:11px;padding:6px 0;">No bills</div>`;
      let html = `<table><thead><tr><th style="width:30px">#</th><th>Customer</th><th>Products</th><th style="width:80px" class="text-right">Bill</th><th style="width:100px" class="text-right">Payment</th><th style="width:80px" class="text-right">Due</th></tr></thead><tbody>`;
      billList.forEach((b, i) => {
        const products = b.items.map(it => `${it.product_name || "Item"} ×${it.quantity}`).join(" · ") || "—";
        const due = b.total - b.paid_amount;
        const breakdownParts = Object.entries(b.breakdown).filter(([_, amt]) => amt > 0).map(([m, amt]) => `<span style="text-transform:capitalize;font-size:10px">${m}: Rs ${amt.toLocaleString()}</span>`).join("<br>");
        const payDetail = breakdownParts || `<span style="font-size:10px">Rs ${b.paid_amount.toLocaleString()}</span>`;
        html += `<tr><td>${i + 1}</td><td style="font-weight:700">${b.customer_name}</td><td style="font-size:10px;color:#555;max-width:220px">${products}</td><td class="text-right">Rs ${b.total.toLocaleString()}</td><td class="text-right" style="color:#2d7d46">${payDetail}</td><td class="text-right" style="color:${due > 0 ? '#c0392b' : '#888'}">${due > 0 ? 'Rs ' + due.toLocaleString() : '—'}</td></tr>`;
      });
      html += `</tbody></table>`;
      return html;
    };

    const paymentMethods = [
      { key: "cash", label: "💵 Cash", accent: "#2d7d46" },
      { key: "bank", label: "🏦 Bank Transfer", accent: "#1a5276" },
      { key: "jazzcash", label: "📱 JazzCash", accent: "#c0392b" },
      { key: "easypaisa", label: "📲 EasyPaisa", accent: "#27ae60" },
    ];

    let billSectionsHtml = "";
    for (const pm of paymentMethods) {
      const filtered = billsWithBreakdown.filter(b => b.payment_status === "paid" && pm.key in b.breakdown);
      if (filtered.length > 0) {
        const methodTotal = filtered.reduce((s, b) => s + (b.breakdown[pm.key] || 0), 0);
        billSectionsHtml += `<div style="margin-bottom:18px"><p style="font-size:13px;font-weight:700;margin-bottom:6px;padding:4px 8px;background:#f8f8f8;border-left:4px solid #333;border-radius:2px">${pm.label} <span style="float:right;font-size:11px;color:#555">Received: Rs ${methodTotal.toLocaleString()}</span></p>${buildBillTable(filtered)}</div>`;
      }
    }

    const creditBills = billsWithBreakdown.filter(b => b.payment_status === "due" || b.payment_status === "partial");
    if (creditBills.length > 0) {
      billSectionsHtml += `<div style="margin-bottom:18px"><p style="font-size:13px;font-weight:700;margin-bottom:6px;padding:4px 8px;background:#f8f8f8;border-left:4px solid #333;border-radius:2px">📋 Credit / Udhar</p>${buildBillTable(creditBills)}</div>`;
    }

    const cashTotal = billsWithBreakdown.filter(b => b.payment_status === "paid").reduce((s, b) => s + (b.breakdown["cash"] || 0), 0);
    const bankTotal = billsWithBreakdown.filter(b => b.payment_status === "paid").reduce((s, b) => s + (b.breakdown["bank"] || 0), 0);
    const jcTotal = billsWithBreakdown.filter(b => b.payment_status === "paid").reduce((s, b) => s + (b.breakdown["jazzcash"] || 0), 0);
    const epTotal = billsWithBreakdown.filter(b => b.payment_status === "paid").reduce((s, b) => s + (b.breakdown["easypaisa"] || 0), 0);
    const totalBilled = bills.reduce((s, b) => s + b.total, 0);
    const creditCash = creditBills.reduce((s, b) => s + (b.breakdown["cash"] || 0), 0);
    const creditBank = creditBills.reduce((s, b) => s + (b.breakdown["bank"] || 0), 0);
    const creditJc = creditBills.reduce((s, b) => s + (b.breakdown["jazzcash"] || 0), 0);
    const creditEp = creditBills.reduce((s, b) => s + (b.breakdown["easypaisa"] || 0), 0);
    const grandCash = cashTotal + creditCash;
    const grandBank = bankTotal + creditBank;
    const grandJc = jcTotal + creditJc;
    const grandEp = epTotal + creditEp;
    const grandReceived = grandCash + grandBank + grandJc + grandEp;
    const totalDue = totalBilled - grandReceived;
    const totalExpensesAmt = expenses.reduce((s, e) => s + e.amount, 0);

    let expensesHtml = "";
    if (expenses.length > 0) {
      expensesHtml = `<div style="margin-bottom:18px"><p style="font-size:13px;font-weight:700;margin-bottom:6px;padding:4px 8px;background:#f8f8f8;border-left:4px solid #333;border-radius:2px">💰 Expenses</p><table><thead><tr><th style="width:30px">#</th><th>Description</th><th>Method</th><th style="width:100px" class="text-right">Amount</th></tr></thead><tbody>`;
      expenses.forEach((e, i) => {
        expensesHtml += `<tr><td>${i + 1}</td><td>${e.description || "—"}</td><td style="text-transform:capitalize">${e.payment_method || "—"}</td><td class="text-right" style="font-weight:700">Rs ${e.amount.toLocaleString()}</td></tr>`;
      });
      expensesHtml += `</tbody><tfoot><tr style="background:#c0392b;color:#fff;"><td colspan="3" style="font-weight:700;border:none;padding:6px 8px">Total Expenses (${expenses.length})</td><td class="text-right" style="font-weight:700;border:none;padding:6px 8px">Rs ${totalExpensesAmt.toLocaleString()}</td></tr></tfoot></table></div>`;
    }

    const fullHtml = `<html><head><title>Summary - ${date}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; padding: 24px 28px; font-size: 12px; color: #222; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 5px 8px; text-align: left; font-size: 11px; border-bottom: 1px solid #e0e0e0; }
      th { font-weight: 600; font-size: 9px; text-transform: uppercase; color: #888; border-bottom: 2px solid #ccc; }
      .text-right { text-align: right; }
      @media print { body { padding: 12px 16px; } }
    </style></head><body>
      <div style="text-align:center;margin-bottom:20px">
        <h1 style="font-size:22px;font-weight:800;letter-spacing:1px;margin-bottom:2px">QAZI ENTERPRISES</h1>
        <p style="font-size:10px;color:#666;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px">Building Materials & General Store</p>
        <span style="font-size:13px;font-weight:600;color:#333;background:#f4f4f4;display:inline-block;padding:4px 16px;border-radius:4px">📊 ${dateDisplay}</span>
      </div>
      <hr style="border:none;border-top:2px solid #222;margin:16px 0">

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">
        <div style="grid-column:span 2;background:#1a5276;color:#fff;border-radius:6px;padding:10px 14px"><div style="font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:1px">💰 Net Cash in Hand</div><div style="font-size:18px;font-weight:700;margin-top:2px;color:${(grandCash - totalExpensesAmt) >= 0 ? '#2ecc71' : '#e74c3c'}">Rs ${(grandCash - totalExpensesAmt).toLocaleString()}</div></div>
        <div style="border:1px solid #ddd;border-radius:6px;padding:10px 14px"><div style="font-size:10px;color:#888;text-transform:uppercase">Total Billed (${day.salesCount} bills)</div><div style="font-size:18px;font-weight:700;margin-top:2px">Rs ${totalBilled.toLocaleString()}</div></div>
        <div style="border:1px solid #ddd;border-radius:6px;padding:10px 14px"><div style="font-size:10px;color:#888;text-transform:uppercase">Total Received</div><div style="font-size:18px;font-weight:700;margin-top:2px;color:#2d7d46">Rs ${grandReceived.toLocaleString()}</div></div>
        <div style="border:1px solid #ddd;border-radius:6px;padding:10px 14px"><div style="font-size:10px;color:#888;text-transform:uppercase">Outstanding / Due</div><div style="font-size:18px;font-weight:700;margin-top:2px;color:#e67e22">Rs ${totalDue.toLocaleString()}</div></div>
        <div style="border:1px solid #ddd;border-radius:6px;padding:10px 14px"><div style="font-size:10px;color:#888;text-transform:uppercase">Expenses (${day.expensesCount})</div><div style="font-size:18px;font-weight:700;margin-top:2px;color:#c0392b">Rs ${day.totalExpenses.toLocaleString()}</div></div>
        <div style="grid-column:span 2;background:#222;color:#fff;border-radius:6px;padding:10px 14px"><div style="font-size:10px;color:#aaa;text-transform:uppercase">Net Revenue</div><div style="font-size:18px;font-weight:700;margin-top:2px;color:${(grandReceived - day.totalExpenses) >= 0 ? '#2ecc71' : '#e74c3c'}">Rs ${(grandReceived - day.totalExpenses).toLocaleString()}</div></div>
      </div>

      ${billSectionsHtml}
      ${expensesHtml}

      <div style="margin-bottom:18px">
        <p style="font-size:13px;font-weight:700;margin-bottom:6px;padding:4px 8px;background:#f8f8f8;border-left:4px solid #333;border-radius:2px">📋 Payment Collection Summary</p>
        <table>
          <thead><tr><th>Payment Method</th><th class="text-right">Amount Received</th></tr></thead>
          <tbody>
            ${grandCash > 0 ? `<tr><td>💵 Cash</td><td class="text-right" style="font-weight:700">Rs ${grandCash.toLocaleString()}</td></tr>` : ''}
            ${grandBank > 0 ? `<tr><td>🏦 Bank Transfer</td><td class="text-right" style="font-weight:700">Rs ${grandBank.toLocaleString()}</td></tr>` : ''}
            ${grandJc > 0 ? `<tr><td>📱 JazzCash</td><td class="text-right" style="font-weight:700">Rs ${grandJc.toLocaleString()}</td></tr>` : ''}
            ${grandEp > 0 ? `<tr><td>📲 EasyPaisa</td><td class="text-right" style="font-weight:700">Rs ${grandEp.toLocaleString()}</td></tr>` : ''}
            <tr style="background:#222;color:#fff;font-weight:700"><td>Total Received</td><td class="text-right">Rs ${grandReceived.toLocaleString()}</td></tr>
            ${totalDue > 0 ? `<tr style="background:#fff3e0"><td style="font-weight:700;color:#e67e22">⏳ Remaining Due</td><td class="text-right" style="font-weight:700;color:#e67e22">Rs ${totalDue.toLocaleString()}</td></tr>` : ''}
            <tr style="background:#333;color:#fff;font-size:13px;font-weight:700"><td>Total Billed</td><td class="text-right">Rs ${totalBilled.toLocaleString()}</td></tr>
          </tbody>
        </table>
      </div>

      <div style="text-align:center;margin-top:24px;font-size:9px;color:#aaa;border-top:1px dashed #ccc;padding-top:8px">Qazi Enterprises — Panighar · Generated at ${timeStr}</div>
    </body></html>`;

    toast.info("Generating PDF, please wait...");

    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.left = "0";
    container.style.top = "0";
    container.style.width = "794px";
    container.style.background = "#fff";
    container.style.zIndex = "-9999";
    container.style.overflow = "hidden";
    container.innerHTML = fullHtml.replace(/<html>.*<body>/s, "").replace(/<\/body>.*<\/html>/s, "");
    const styleMatch = fullHtml.match(/<style>([\s\S]*?)<\/style>/);
    if (styleMatch) {
      const styleEl = document.createElement("style");
      styleEl.textContent = styleMatch[1];
      container.prepend(styleEl);
    }
    container.style.padding = "24px 28px";
    container.style.fontFamily = "'Segoe UI', Arial, sans-serif";
    container.style.fontSize = "12px";
    container.style.color = "#222";
    document.body.appendChild(container);
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

      pdf.save(`Summary_${date}.pdf`);
      toast.success("PDF downloaded successfully!");
    } catch (err) {
      console.error("PDF generation error:", err);
      toast.error("Failed to generate PDF");
    } finally {
      document.body.removeChild(container);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Daily Reports</h1>
          <p className="text-sm text-muted-foreground">Sales, purchases & expenses summary</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-2" disabled={summaries.length === 0} onClick={() => {
            exportToExcel(summaries.map(d => ({
              Date: d.date, Sales: d.totalSales, Purchases: d.totalPurchases,
              Expenses: d.totalExpenses, "Net Profit": d.profit,
              "Sales Count": d.salesCount, "Purchases Count": d.purchasesCount, "Expenses Count": d.expensesCount,
            })), "Daily_Reports");
            toast.success("Exported to Excel");
          }}><Download className="h-4 w-4" /> Excel</Button>
        </div>
      </div>

      <DayTransactionsDialog open={!!selectedDate} onOpenChange={(o) => !o && setSelectedDate(null)} date={selectedDate || ""} onDataChanged={handleDataChanged} />


      {/* Date Filters */}
      <div className="flex gap-4 mb-6 items-end">
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1"><CalendarDays className="h-3 w-3" /> From</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1"><CalendarDays className="h-3 w-3" /> To</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Sales</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">PKR {totals.sales.toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Purchases</CardTitle>
            <ShoppingCart className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-blue-600">PKR {totals.purchases.toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Expenses</CardTitle>
            <Receipt className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive">PKR {totals.expenses.toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Profit</CardTitle>
            <DollarSign className="h-4 w-4" />
          </CardHeader>
          <CardContent><div className={`text-2xl font-bold ${totals.profit >= 0 ? "text-green-600" : "text-destructive"}`}>PKR {totals.profit.toLocaleString()}</div></CardContent>
        </Card>
      </div>

      {/* Trend Chart */}
      {!loading && summaries.length > 1 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Daily Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <DailyTrendChart data={summaries} />
          </CardContent>
        </Card>
      )}

      {/* Daily Table */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : summaries.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <CalendarDays className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">No transactions found for this date range.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Sales</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Purchases</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Expenses</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Net Profit</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Transactions</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((d, i) => (
                <React.Fragment key={d.date}>
                  <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => toggleDateExpand(d.date)}>
                    <td className="px-4 py-3 font-medium">{d.date}</td>
                    <td className="px-4 py-3 text-right text-green-600">PKR {d.totalSales.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-blue-600">PKR {d.totalPurchases.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-destructive">PKR {d.totalExpenses.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-right font-bold ${d.profit >= 0 ? "text-green-600" : "text-destructive"}`}>
                      PKR {d.profit.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {d.salesCount > 0 && <Badge variant="secondary" className="text-xs">{d.salesCount} sale{d.salesCount > 1 ? "s" : ""}</Badge>}
                        {d.purchasesCount > 0 && <Badge variant="outline" className="text-xs">{d.purchasesCount} purch.</Badge>}
                        {d.expensesCount > 0 && <Badge variant="destructive" className="text-xs">{d.expensesCount} exp.</Badge>}
                      </div>
                    </td>
                  </motion.tr>
                  {expandedDate === d.date && (
                    <tr>
                      <td colSpan={6} className="p-0">
                        <div className="bg-muted/20 border-y p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-semibold">Invoices for {d.date}</h4>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" className="gap-2 h-7 text-xs" onClick={() => handlePrintDaySummary(d.date)}>
                                <Printer className="h-3 w-3" /> Print Summary
                              </Button>
                              <Button size="sm" variant="outline" className="gap-2 h-7 text-xs" onClick={() => handleDownloadDaySummary(d.date)}>
                                <FileDown className="h-3 w-3" /> Download PDF
                              </Button>
                            </div>
                          </div>
                          {!invoiceDetails[d.date] ? (
                            <p className="text-sm text-muted-foreground">Loading...</p>
                          ) : invoiceDetails[d.date].length === 0 ? (
                            <p className="text-sm text-muted-foreground">No invoices for this date.</p>
                          ) : (
                            <>
                              <table className="w-full text-xs border rounded">
                                <thead>
                                  <tr className="bg-muted/50 border-b">
                                    <th className="px-3 py-2 text-left font-medium">#</th>
                                    <th className="px-3 py-2 text-left font-medium">Invoice</th>
                                    <th className="px-3 py-2 text-left font-medium">Customer</th>
                                    <th className="px-3 py-2 text-left font-medium">Payment</th>
                                    <th className="px-3 py-2 text-left font-medium">Status</th>
                                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {invoiceDetails[d.date].map((inv, idx) => (
                                    <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/20">
                                      <td className="px-3 py-1.5">{idx + 1}</td>
                                      <td className="px-3 py-1.5 font-mono">{inv.invoice_no || "—"}</td>
                                      <td className="px-3 py-1.5">{inv.customer_name}</td>
                                      <td className="px-3 py-1.5 capitalize">{inv.payment_method}</td>
                                      <td className="px-3 py-1.5">
                                        <Badge variant={inv.payment_status === "paid" ? "default" : "destructive"} className="text-[10px]">{inv.payment_status}</Badge>
                                      </td>
                                      <td className="px-3 py-1.5 text-right font-medium">PKR {inv.total.toLocaleString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <Separator className="my-3" />
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                <div className="rounded border p-2 bg-card">
                                  <span className="text-muted-foreground">Cash:</span>
                                  <span className="float-right font-bold">PKR {invoiceDetails[d.date].filter(i => i.payment_method === "cash" && i.payment_status === "paid").reduce((s, i) => s + i.total, 0).toLocaleString()}</span>
                                </div>
                                <div className="rounded border p-2 bg-card">
                                  <span className="text-muted-foreground">Bank:</span>
                                  <span className="float-right font-bold">PKR {invoiceDetails[d.date].filter(i => i.payment_method === "bank" && i.payment_status === "paid").reduce((s, i) => s + i.total, 0).toLocaleString()}</span>
                                </div>
                                <div className="rounded border p-2 bg-card">
                                  <span className="text-muted-foreground">JC/EP:</span>
                                  <span className="float-right font-bold">PKR {invoiceDetails[d.date].filter(i => (i.payment_method === "jazzcash" || i.payment_method === "easypaisa") && i.payment_status === "paid").reduce((s, i) => s + i.total, 0).toLocaleString()}</span>
                                </div>
                                <div className="rounded border p-2 bg-card">
                                  <span className="text-muted-foreground">Credit:</span>
                                  <span className="float-right font-bold text-amber-600">PKR {invoiceDetails[d.date].filter(i => i.payment_status === "due" || i.payment_status === "partial").reduce((s, i) => s + i.total, 0).toLocaleString()}</span>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/50 font-bold">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right text-green-600">PKR {totals.sales.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-blue-600">PKR {totals.purchases.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-destructive">PKR {totals.expenses.toLocaleString()}</td>
                <td className={`px-4 py-3 text-right ${totals.profit >= 0 ? "text-green-600" : "text-destructive"}`}>PKR {totals.profit.toLocaleString()}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
