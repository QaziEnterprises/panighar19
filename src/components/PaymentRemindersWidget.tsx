import { useState, useEffect } from "react";
import { MessageCircle, ArrowRight, Clock, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/customClient";
import { motion } from "framer-motion";

interface OverdueCustomer {
  customer_id: string;
  customer_name: string;
  phone: string | null;
  total_due: number;
  oldest_date: string;
  invoice_count: number;
}

function formatPhone(phone: string | null): string | null {
  if (!phone) return null;
  let cleaned = phone.replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("0")) cleaned = "92" + cleaned.slice(1);
  if (!cleaned.startsWith("+") && !cleaned.startsWith("92")) cleaned = "92" + cleaned;
  cleaned = cleaned.replace(/^\+/, "");
  return cleaned;
}

function daysSince(dateStr: string): number {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export default function PaymentRemindersWidget() {
  const [overdueCustomers, setOverdueCustomers] = useState<OverdueCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOverdue = async () => {
      try {
        const { data: sales } = await supabase
          .from("sale_transactions")
          .select("id, customer_id, total, date, payment_status")
          .in("payment_status", ["due", "partial"])
          .not("customer_id", "is", null)
          .order("date", { ascending: true });

        if (!sales || sales.length === 0) {
          setOverdueCustomers([]);
          setLoading(false);
          return;
        }

        const customerIds = [...new Set(sales.map(s => s.customer_id!))];
        const { data: contacts } = await supabase
          .from("contacts")
          .select("id, name, phone")
          .in("id", customerIds);

        const contactMap = new Map((contacts || []).map(c => [c.id, c]));

        const grouped = new Map<string, OverdueCustomer>();
        for (const sale of sales) {
          const cid = sale.customer_id!;
          const contact = contactMap.get(cid);
          if (!grouped.has(cid)) {
            grouped.set(cid, {
              customer_id: cid,
              customer_name: (contact as any)?.name || "Unknown",
              phone: (contact as any)?.phone || null,
              total_due: 0,
              oldest_date: sale.date,
              invoice_count: 0,
            });
          }
          const entry = grouped.get(cid)!;
          entry.total_due += Number(sale.total || 0);
          entry.invoice_count++;
          if (sale.date < entry.oldest_date) entry.oldest_date = sale.date;
        }

        const sorted = Array.from(grouped.values()).sort((a, b) => b.total_due - a.total_due).slice(0, 8);
        setOverdueCustomers(sorted);
      } catch (e) {
        console.error("Payment reminders fetch error:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchOverdue();
  }, []);

  const sendReminder = (customer: OverdueCustomer) => {
    const phone = formatPhone(customer.phone);
    const msg = `*Qazi Enterprises - Payment Reminder*\n\nDear ${customer.customer_name},\n\nThis is a friendly reminder that you have an outstanding balance of *PKR ${customer.total_due.toLocaleString()}* across ${customer.invoice_count} invoice(s).\n\nKindly arrange the payment at your earliest convenience.\n\n_آپ کا واجب الادا بقایا PKR ${customer.total_due.toLocaleString()} ہے۔ براہ کرم جلد از جلد ادائیگی کریں۔_\n\nThank you!\nQazi Enterprises`;
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  };

  if (loading) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-warning" /> Payment Reminders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-6">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-warning" /> Payment Reminders
        </CardTitle>
        <Link to="/receivables">
          <Button variant="ghost" size="sm" className="text-xs h-7 gap-1">
            View All <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {overdueCustomers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="rounded-full bg-success/10 p-3 mb-3">
              <Users className="h-5 w-5 text-success" />
            </div>
            <p className="text-sm text-muted-foreground">No overdue payments! 🎉</p>
          </div>
        ) : (
          <div className="space-y-2">
            {overdueCustomers.map((c, i) => {
              const days = daysSince(c.oldest_date);
              return (
                <motion.div
                  key={c.customer_id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                  className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm transition-colors hover:bg-muted/50 gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium block truncate">{c.customer_name}</span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {days}d overdue
                      </span>
                      <span>·</span>
                      <span>{c.invoice_count} bill{c.invoice_count > 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold text-warning">PKR {c.total_due.toLocaleString()}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1 border-success/40 text-success hover:bg-success hover:text-success-foreground"
                      onClick={() => sendReminder(c)}
                    >
                      <MessageCircle className="h-3 w-3" /> Remind
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
