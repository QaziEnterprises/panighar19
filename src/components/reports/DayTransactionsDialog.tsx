import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/customClient";
import { toast } from "sonner";

interface Transaction {
  id: string;
  type: "sale" | "purchase" | "expense";
  amount: number;
  description: string;
  payment_method?: string;
  reference?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  onDataChanged: () => void;
}

export default function DayTransactionsDialog({ open, onOpenChange, date, onDataChanged }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    if (!open || !date) return;
    fetchTransactions();
  }, [open, date]);

  const fetchTransactions = async () => {
    setLoading(true);
    const [{ data: sales }, { data: purchases }, { data: expenses }] = await Promise.all([
      supabase.from("sale_transactions").select("id, total, invoice_no, payment_method, notes").eq("date", date),
      supabase.from("purchases").select("id, total, reference_no, payment_method, notes").eq("date", date),
      supabase.from("expenses").select("id, amount, description, payment_method, reference_no").eq("date", date),
    ]);

    const txns: Transaction[] = [
      ...(sales || []).map((s) => ({
        id: s.id, type: "sale" as const, amount: Number(s.total || 0),
        description: s.invoice_no || s.notes || "Sale", payment_method: s.payment_method, reference: s.invoice_no,
      })),
      ...(purchases || []).map((p) => ({
        id: p.id, type: "purchase" as const, amount: Number(p.total || 0),
        description: p.notes || "Purchase", payment_method: p.payment_method, reference: p.reference_no,
      })),
      ...(expenses || []).map((e) => ({
        id: e.id, type: "expense" as const, amount: Number(e.amount || 0),
        description: e.description || "Expense", payment_method: e.payment_method, reference: e.reference_no,
      })),
    ];
    setTransactions(txns);
    setLoading(false);
  };

  const handleEdit = (txn: Transaction) => {
    setEditingId(txn.id);
    setEditValue(txn.amount.toString());
  };

  const handleSaveEdit = async (txn: Transaction) => {
    const newAmount = parseFloat(editValue);
    if (isNaN(newAmount) || newAmount < 0) { toast.error("Invalid amount"); return; }

    let error;
    if (txn.type === "sale") {
      ({ error } = await supabase.from("sale_transactions").update({ total: newAmount, subtotal: newAmount }).eq("id", txn.id));
    } else if (txn.type === "purchase") {
      ({ error } = await supabase.from("purchases").update({ total: newAmount }).eq("id", txn.id));
    } else {
      ({ error } = await supabase.from("expenses").update({ amount: newAmount }).eq("id", txn.id));
    }

    if (error) { toast.error("Failed to update"); console.error(error); }
    else { toast.success("Updated"); setEditingId(null); fetchTransactions(); onDataChanged(); }
  };

  const handleDelete = async (txn: Transaction) => {
    if (!confirm(`Delete this ${txn.type} (Rs ${txn.amount.toLocaleString()})?`)) return;

    let error;
    if (txn.type === "sale") {
      await supabase.from("sale_items").delete().eq("sale_id", txn.id);
      ({ error } = await supabase.from("sale_transactions").delete().eq("id", txn.id));
    } else if (txn.type === "purchase") {
      await supabase.from("purchase_items").delete().eq("purchase_id", txn.id);
      ({ error } = await supabase.from("purchases").delete().eq("id", txn.id));
    } else {
      ({ error } = await supabase.from("expenses").delete().eq("id", txn.id));
    }

    if (error) { toast.error("Failed to delete"); console.error(error); }
    else { toast.success("Deleted"); fetchTransactions(); onDataChanged(); }
  };

  const typeColor = (t: string) => t === "sale" ? "default" : t === "purchase" ? "secondary" : "destructive";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transactions — {date}</DialogTitle>
          <DialogDescription>{transactions.length} transaction(s) on this day</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : transactions.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">No transactions found</div>
        ) : (
          <div className="space-y-2">
            {transactions.map((txn) => (
              <div key={txn.id} className="flex items-center justify-between rounded-lg border p-3 gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={typeColor(txn.type)} className="text-xs">{txn.type}</Badge>
                    {txn.reference && <span className="text-xs text-muted-foreground">{txn.reference}</span>}
                  </div>
                  <p className="text-sm truncate">{txn.description}</p>
                  {txn.payment_method && <p className="text-xs text-muted-foreground">{txn.payment_method}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {editingId === txn.id ? (
                    <>
                      <Input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} className="w-24 h-8 text-sm" />
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleSaveEdit(txn)}><Check className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /></Button>
                    </>
                  ) : (
                    <>
                      <span className="font-bold text-sm whitespace-nowrap">PKR {txn.amount.toLocaleString()}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(txn)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(txn)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
