import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/customClient";
import { useAuth } from "@/hooks/useAuth";

interface Notification {
  id: string;
  title: string;
  message: string | null;
  type: string;
  is_read: boolean;
  link: string | null;
  created_at: string;
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    const items = (data || []) as Notification[];
    setNotifications(items);
    setUnreadCount(items.filter((n) => !n.is_read).length);
  }, [user]);

  const markAsRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const dismiss = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setUnreadCount((prev) => {
      const waUnread = notifications.find((n) => n.id === id && !n.is_read);
      return waUnread ? Math.max(0, prev - 1) : prev;
    });
  };

  const generateAlerts = useCallback(async () => {
    if (!user) return;

    // Low stock alerts
    const { data: products } = await supabase
      .from("products")
      .select("id, name, quantity, alert_threshold");

    const lowStock = (products || []).filter(
      (p: any) => p.alert_threshold && p.alert_threshold > 0 && (p.quantity || 0) <= p.alert_threshold
    );

    // Overdue payments (7+ days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { data: overdue } = await supabase
      .from("sale_transactions")
      .select("id, invoice_no, total, paid_amount, date, customer_id")
      .in("payment_status", ["due", "partial"])
      .lt("date", sevenDaysAgo.toISOString().split("T")[0]);

    // Check existing notifications to avoid duplicates
    const { data: existing } = await supabase
      .from("notifications")
      .select("title, message")
      .eq("user_id", user.id)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const existingKeys = new Set((existing || []).map((e: any) => `${e.title}-${e.message}`));

    const newNotifications: any[] = [];

    for (const p of lowStock) {
      const title = "Low Stock Alert";
      const message = `${(p as any).name} has only ${(p as any).quantity} units left (threshold: ${(p as any).alert_threshold})`;
      if (!existingKeys.has(`${title}-${message}`)) {
        newNotifications.push({
          user_id: user.id,
          title,
          message,
          type: "warning",
          link: "/products-db",
        });
      }
    }

    for (const sale of overdue || []) {
      const due = Number(sale.total || 0) - Number(sale.paid_amount || 0);
      const title = "Overdue Payment";
      const message = `Invoice ${sale.invoice_no || sale.id.slice(0, 8)} has PKR ${due.toLocaleString()} overdue since ${sale.date}`;
      if (!existingKeys.has(`${title}-${message}`)) {
        newNotifications.push({
          user_id: user.id,
          title,
          message,
          type: "alert",
          link: "/bills",
        });
      }
    }

    if (newNotifications.length > 0) {
      await supabase.from("notifications").insert(newNotifications);
      fetchNotifications();
    }
  }, [user, fetchNotifications]);

  useEffect(() => {
    fetchNotifications();
    generateAlerts();
    const interval = setInterval(() => {
      fetchNotifications();
      generateAlerts();
    }, 5 * 60 * 1000); // every 5 minutes
    return () => clearInterval(interval);
  }, [fetchNotifications, generateAlerts]);

  return { notifications, unreadCount, markAsRead, markAllRead, dismiss, fetchNotifications };
}
