import { supabase } from "@/integrations/supabase/customClient";

interface StatementEntry {
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export async function generateCustomerStatementPDF(
  contact: { id: string; name: string; phone: string | null; address?: string | null; current_balance: number; opening_balance: number }
) {
  // Fetch ledger entries
  const { data: ledgerEntries } = await supabase
    .from("ledger_entries")
    .select("*")
    .eq("contact_id", contact.id)
    .order("date", { ascending: true });

  // Fetch sales for this customer
  const { data: sales } = await supabase
    .from("sale_transactions")
    .select("id, invoice_no, date, total, paid_amount, payment_status, payment_method")
    .eq("customer_id", contact.id)
    .order("date", { ascending: true });

  // Fetch payments
  const saleIds = (sales || []).map((s: any) => s.id);
  let payments: any[] = [];
  if (saleIds.length > 0) {
    const { data } = await supabase
      .from("receivable_payments")
      .select("*")
      .in("sale_id", saleIds)
      .order("date", { ascending: true });
    payments = data || [];
  }

  // Build statement entries
  const entries: StatementEntry[] = [];
  let runningBalance = Number(contact.opening_balance || 0);

  // Opening balance entry
  entries.push({
    date: "—",
    description: "Opening Balance",
    debit: runningBalance > 0 ? runningBalance : 0,
    credit: runningBalance < 0 ? Math.abs(runningBalance) : 0,
    balance: runningBalance,
  });

  // Combine sales and payments into chronological order
  const allEvents: { date: string; type: string; description: string; debit: number; credit: number }[] = [];

  for (const sale of sales || []) {
    allEvents.push({
      date: sale.date,
      type: "sale",
      description: `Sale ${sale.invoice_no || ""} (${sale.payment_method || "cash"})`,
      debit: Number(sale.total || 0),
      credit: 0,
    });
    if (Number(sale.paid_amount || 0) > 0 && sale.payment_status !== "due") {
      allEvents.push({
        date: sale.date,
        type: "payment",
        description: `Payment for ${sale.invoice_no || "sale"} (${sale.payment_method || "cash"})`,
        debit: 0,
        credit: Number(sale.paid_amount || 0),
      });
    }
  }

  for (const payment of payments) {
    allEvents.push({
      date: payment.date,
      type: "payment",
      description: `Payment received (${payment.payment_method || "cash"})${payment.notes ? " - " + payment.notes : ""}`,
      debit: 0,
      credit: Number(payment.amount || 0),
    });
  }

  // Also add ledger entries if any
  for (const le of ledgerEntries || []) {
    allEvents.push({
      date: le.date,
      type: "ledger",
      description: le.description,
      debit: Number(le.debit || 0),
      credit: Number(le.credit || 0),
    });
  }

  // Sort by date
  allEvents.sort((a, b) => a.date.localeCompare(b.date));

  // Deduplicate: if ledger entry matches a sale/payment, skip it
  const seen = new Set<string>();
  for (const event of allEvents) {
    const key = `${event.date}-${event.debit}-${event.credit}-${event.type}`;
    if (seen.has(key) && event.type === "ledger") continue;
    seen.add(key);

    runningBalance = runningBalance + event.debit - event.credit;
    entries.push({
      date: event.date,
      description: event.description,
      debit: event.debit,
      credit: event.credit,
      balance: runningBalance,
    });
  }

  // Generate HTML for PDF
  const today = new Date().toLocaleDateString("en-PK", { year: "numeric", month: "long", day: "numeric" });
  const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);

  const html = `
    <html>
    <head>
      <title>Statement - ${contact.name}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 30px; color: #1a1a1a; font-size: 12px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 3px solid #f59e0b; padding-bottom: 15px; }
        .header h1 { font-size: 22px; font-weight: 700; color: #1a1a1a; }
        .header .subtitle { color: #666; font-size: 11px; margin-top: 2px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
        .info-box { background: #f8f9fa; border-radius: 8px; padding: 12px; }
        .info-box label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
        .info-box p { font-weight: 600; margin-top: 2px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { background: #1a1a1a; color: white; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
        td { padding: 7px 10px; border-bottom: 1px solid #eee; font-size: 11px; }
        tr:nth-child(even) { background: #fafafa; }
        .amount { text-align: right; font-family: 'Courier New', monospace; font-weight: 600; }
        .debit { color: #dc2626; }
        .credit { color: #16a34a; }
        .total-row { background: #f59e0b !important; color: white; font-weight: 700; }
        .total-row td { border: none; padding: 10px; }
        .balance-box { margin-top: 20px; text-align: right; }
        .balance-box .final { font-size: 20px; font-weight: 700; color: ${runningBalance > 0 ? "#dc2626" : "#16a34a"}; }
        .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; text-align: center; color: #999; font-size: 10px; }
        @media print { body { padding: 15px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>Qazi Enterprises</h1>
          <div class="subtitle">Customer Account Statement</div>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: 600;">Statement Date</div>
          <div>${today}</div>
        </div>
      </div>

      <div class="info-grid">
        <div class="info-box">
          <label>Customer Name</label>
          <p>${contact.name}</p>
          ${contact.phone ? `<p style="font-weight:400; color:#666; margin-top:2px;">${contact.phone}</p>` : ""}
        </div>
        <div class="info-box">
          <label>Current Balance</label>
          <p style="color: ${contact.current_balance > 0 ? "#dc2626" : "#16a34a"};">
            PKR ${Math.abs(contact.current_balance).toLocaleString()}
            ${contact.current_balance > 0 ? " (Receivable)" : contact.current_balance < 0 ? " (Overpaid)" : ""}
          </p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th class="amount">Debit (Dr)</th>
            <th class="amount">Credit (Cr)</th>
            <th class="amount">Balance</th>
          </tr>
        </thead>
        <tbody>
          ${entries
            .map(
              (e) => `
            <tr>
              <td>${e.date}</td>
              <td>${e.description}</td>
              <td class="amount debit">${e.debit > 0 ? "PKR " + e.debit.toLocaleString() : "—"}</td>
              <td class="amount credit">${e.credit > 0 ? "PKR " + e.credit.toLocaleString() : "—"}</td>
              <td class="amount" style="color: ${e.balance > 0 ? "#dc2626" : "#16a34a"}">PKR ${Math.abs(e.balance).toLocaleString()}</td>
            </tr>
          `
            )
            .join("")}
          <tr class="total-row">
            <td colspan="2" style="text-align:right;">TOTALS</td>
            <td class="amount">PKR ${totalDebit.toLocaleString()}</td>
            <td class="amount">PKR ${totalCredit.toLocaleString()}</td>
            <td class="amount">PKR ${Math.abs(runningBalance).toLocaleString()}</td>
          </tr>
        </tbody>
      </table>

      <div class="balance-box">
        <div style="font-size: 11px; color: #666;">Final Balance</div>
        <div class="final">
          PKR ${Math.abs(runningBalance).toLocaleString()}
          ${runningBalance > 0 ? " Receivable" : runningBalance < 0 ? " Overpaid" : " Settled"}
        </div>
      </div>

      <div class="footer">
        Generated by Qazi Enterprises Business Manager • ${today}
      </div>
    </body>
    </html>
  `;

  // Open in new window for printing
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  }
}
