import { useState, useEffect, useRef } from "react";
import { offlineQuery } from "@/lib/offlineQuery";
import { Plus, Search, X, Receipt, Pencil, Trash2, Save, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/customClient";
import { retryQuery, retryMutation } from "@/lib/retryFetch";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { NumberInput } from "@/components/NumberInput";
import { exportToExcel, importFromExcel } from "@/lib/exportUtils";
import { logAction } from "@/lib/auditLog";

interface Expense {
  id: string; category_id: string | null; amount: number; date: string;
  description: string | null; payment_method: string; reference_no: string | null;
}

interface Category { id: string; name: string; }

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ category_id: "", amount: 0, date: new Date().toISOString().split("T")[0], description: "", payment_method: "cash", reference_no: "" });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [exps, cats] = await Promise.all([
        offlineQuery<Expense>("expenses", { order: "date", ascending: false }),
        offlineQuery<Category>("expense_categories", { order: "name" }),
      ]);
      setExpenses(exps);
      setCategories(cats);
    } catch (e) {
      console.error("Expenses fetch error:", e);
      toast.error("Failed to load expenses");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all");

  const getDateFilteredExpenses = () => {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    return expenses.filter((e) => {
      if (dateFilter === "today") return e.date === todayStr;
      if (dateFilter === "week") {
        const d = new Date(e.date);
        const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
        return diff <= 7;
      }
      if (dateFilter === "month") {
        const d = new Date(e.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }
      return true;
    });
  };

  const filtered = getDateFilteredExpenses().filter((e) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (e.description || "").toLowerCase().includes(q) || (e.reference_no || "").toLowerCase().includes(q);
  });

  const totalExpenses = filtered.reduce((s, e) => s + Number(e.amount), 0);

  const categorySummary = categories.map((cat) => {
    const catExpenses = filtered.filter((e) => e.category_id === cat.id);
    const total = catExpenses.reduce((s, e) => s + Number(e.amount), 0);
    return { name: cat.name, total };
  }).filter((c) => c.total > 0).sort((a, b) => b.total - a.total);

  const handleSave = async () => {
    if (!form.amount) { toast.error("Amount is required"); return; }
    const payload = {
      category_id: form.category_id || null, amount: form.amount,
      date: form.date, description: form.description || null,
      payment_method: form.payment_method, reference_no: form.reference_no || null,
    };

    if (editingId) {
      const { error } = await supabase.from("expenses").update(payload).eq("id", editingId);
      if (error) { toast.error("Failed to update"); return; }
      toast.success("Expense updated");
      logAction("update", "expense", editingId, `Updated expense Rs ${form.amount}`);
    } else {
      const { data, error } = await supabase.from("expenses").insert(payload).select().single();
      if (error) { toast.error("Failed to add expense"); return; }
      toast.success("Expense added");
      logAction("create", "expense", data?.id || "", `Expense Rs ${form.amount} - ${form.description || "No desc"}`);
    }
    setDialogOpen(false); setEditingId(null);
    setForm({ category_id: "", amount: 0, date: new Date().toISOString().split("T")[0], description: "", payment_method: "cash", reference_no: "" });
    fetchData();
  };

  const startEdit = (e: Expense) => {
    setEditingId(e.id);
    setForm({ category_id: e.category_id || "", amount: e.amount, date: e.date, description: e.description || "", payment_method: e.payment_method, reference_no: e.reference_no || "" });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this expense?")) return;
    const exp = expenses.find(e => e.id === id);
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) { toast.error("Failed to delete"); return; }
    toast.success("Expense deleted");
    logAction("delete", "expense", id, `Deleted expense Rs ${exp?.amount || 0}`);
    fetchData();
  };

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    const { error } = await supabase.from("expense_categories").insert({ name: newCatName.trim() });
    if (error) { toast.error("Failed to add category"); return; }
    toast.success("Category added"); setNewCatName(""); setCatDialogOpen(false); fetchData();
  };

  const getCategoryName = (id: string | null) => categories.find((c) => c.id === id)?.name || "Uncategorized";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportExcel = () => {
    exportToExcel(filtered.map(e => ({
      Date: e.date, Category: getCategoryName(e.category_id), Description: e.description || "",
      "Payment Method": e.payment_method, "Reference No": e.reference_no || "", Amount: Number(e.amount),
    })), "Expenses");
  };


  const handleImport = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      const rows = await importFromExcel<any>(file);
      let count = 0;
      for (const row of rows) {
        const amount = Number(row.Amount || row.amount || 0);
        if (!amount) continue;
        await supabase.from("expenses").insert({
          amount, date: row.Date || row.date || new Date().toISOString().split("T")[0],
          description: row.Description || row.description || null,
          payment_method: row["Payment Method"] || row.payment_method || "cash",
          reference_no: row["Reference No"] || row.reference_no || null,
        });
        count++;
      }
      toast.success(`Imported ${count} expenses`);
      fetchData();
    } catch { toast.error("Failed to import"); }
    ev.target.value = "";
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
          <p className="text-sm text-muted-foreground">Total: Rs {totalExpenses.toLocaleString()}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input type="file" accept=".xlsx,.xls" className="hidden" ref={fileInputRef} onChange={handleImport} />
          <Button size="sm" variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()}><Upload className="h-4 w-4" /> Import</Button>
          <Button size="sm" variant="outline" className="gap-2" onClick={handleExportExcel} disabled={filtered.length === 0}><Download className="h-4 w-4" /> Excel</Button>
          
          <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
            <DialogTrigger asChild><Button variant="outline" size="sm" className="gap-2"><Plus className="h-4 w-4" /> Category</Button></DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>Add Expense Category</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Category name" />
                <Button onClick={addCategory} className="w-full">Save</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditingId(null); }}>
            <DialogTrigger asChild><Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> Add Expense</Button></DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>{editingId ? "Edit Expense" : "Add Expense"}</DialogTitle></DialogHeader>
              <div className="grid gap-3 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Amount *</Label><NumberInput value={form.amount} onValueChange={(v) => setForm({ ...form, amount: v })} /></div>
                  <div className="space-y-1"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Category</Label>
                    <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Payment Method</Label>
                    <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bank">Bank Transfer</SelectItem>
                        <SelectItem value="jazzcash">JazzCash</SelectItem>
                        <SelectItem value="easypaisa">EasyPaisa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <div className="space-y-1"><Label>Reference No</Label><Input value={form.reference_no} onChange={(e) => setForm({ ...form, reference_no: e.target.value })} /></div>
                <Button onClick={handleSave} className="gap-2"><Save className="h-4 w-4" /> {editingId ? "Update" : "Save"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Date Filter Tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(["all", "today", "week", "month"] as const).map((f) => (
          <Button key={f} variant={dateFilter === f ? "default" : "outline"} size="sm" onClick={() => setDateFilter(f)} className="capitalize text-xs">
            {f === "all" ? "All Time" : f === "today" ? "Today" : f === "week" ? "This Week" : "This Month"}
          </Button>
        ))}
      </div>

      {/* Category Summary */}
      {categorySummary.length > 0 && (
        <div className="mb-4 rounded-lg border p-4">
          <h3 className="text-sm font-semibold mb-2">Category Breakdown</h3>
          <div className="space-y-2">
            {categorySummary.map((cat) => (
              <div key={cat.name} className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground w-28 truncate">{cat.name}</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, (cat.total / totalExpenses) * 100)}%` }} />
                </div>
                <span className="text-sm font-medium w-24 text-right">Rs {cat.total.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search expenses..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Receipt className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">No expenses recorded yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Category</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Description</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Method</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Amount</th>
                <th className="px-4 py-3 w-24 text-center font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => (
                <motion.tr key={e.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.01 }} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">{e.date}</td>
                  <td className="px-4 py-3"><Badge variant="secondary">{getCategoryName(e.category_id)}</Badge></td>
                  <td className="px-4 py-3 text-muted-foreground">{e.description || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">{e.payment_method}</td>
                  <td className="px-4 py-3 text-right font-medium text-destructive">Rs {Number(e.amount).toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(e)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(e.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/50 font-bold">
                <td colSpan={4} className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right text-destructive">Rs {totalExpenses.toLocaleString()}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
