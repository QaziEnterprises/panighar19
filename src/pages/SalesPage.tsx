import { useState, useEffect, useRef } from "react";
import { Upload, Search, X, FileSpreadsheet, Download, Plus, Pencil, Trash2, Save, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SaleEntry } from "@/types";
import { getSales, saveSales } from "@/lib/store";
import { parseSalesXlsx, exportSalesXlsx } from "@/lib/excel";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { NumberInput } from "@/components/NumberInput";

export default function SalesPage() {
  const [items, setItems] = useState<SaleEntry[]>([]);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<SaleEntry>>({});
  const [addingNew, setAddingNew] = useState(false);
  const [newForm, setNewForm] = useState<Partial<SaleEntry>>({ date: "", customerName: "", billNo: "", cash: 0, jc: 0, ep: 0, bt: 0, notPaid: 0 });
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceFileRef = useRef<HTMLInputElement>(null);

  const reload = () => setItems(getSales());
  useEffect(reload, []);

  const filtered = items.filter((i) =>
    i.customerName.toLowerCase().includes(search.toLowerCase()) ||
    i.billNo.toLowerCase().includes(search.toLowerCase())
  );

  const totals = filtered.reduce(
    (acc, s) => ({
      cash: acc.cash + s.cash,
      jc: acc.jc + s.jc,
      ep: acc.ep + s.ep,
      bt: acc.bt + s.bt,
      notPaid: acc.notPaid + s.notPaid,
    }),
    { cash: 0, jc: 0, ep: 0, bt: 0, notPaid: 0 }
  );

  const handleMergeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseSalesXlsx(file);
      const existing = getSales();
      const existingKeys = new Set(existing.map((s) => `${s.billNo}-${s.customerName.toLowerCase()}`));
      const newEntries = parsed.filter((s) => !existingKeys.has(`${s.billNo}-${s.customerName.toLowerCase()}`));
      const merged = [...existing, ...newEntries];
      saveSales(merged);
      reload();
      toast.success(`Merged: ${newEntries.length} new entries added`);
    } catch {
      toast.error("Failed to parse Excel file");
    }
    e.target.value = "";
  };

  const handleReplaceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseSalesXlsx(file);
      saveSales(parsed);
      reload();
      toast.success(`Replaced with ${parsed.length} entries`);
    } catch {
      toast.error("Failed to parse Excel file");
    }
    e.target.value = "";
  };

  const deleteEntry = (id: string) => {
    const updated = items.filter((i) => i.id !== id);
    saveSales(updated);
    setItems(updated);
    toast.success("Entry deleted");
  };

  const startEdit = (item: SaleEntry) => {
    setEditingId(item.id);
    setEditForm({ ...item });
  };

  const saveEdit = () => {
    if (!editingId) return;
    const updated = items.map((i) =>
      i.id === editingId
        ? { ...i, ...editForm, cash: Number(editForm.cash) || 0, jc: Number(editForm.jc) || 0, ep: Number(editForm.ep) || 0, bt: Number(editForm.bt) || 0, notPaid: Number(editForm.notPaid) || 0 }
        : i
    );
    saveSales(updated);
    setItems(updated);
    setEditingId(null);
    toast.success("Entry updated");
  };

  const addNewEntry = () => {
    const entry: SaleEntry = {
      id: crypto.randomUUID(),
      date: newForm.date || "",
      customerName: newForm.customerName || "New Customer",
      billNo: newForm.billNo || "",
      cash: Number(newForm.cash) || 0,
      jc: Number(newForm.jc) || 0,
      ep: Number(newForm.ep) || 0,
      bt: Number(newForm.bt) || 0,
      notPaid: Number(newForm.notPaid) || 0,
    };
    const updated = [...items, entry];
    saveSales(updated);
    setItems(updated);
    setAddingNew(false);
    setNewForm({ date: "", customerName: "", billNo: "", cash: 0, jc: 0, ep: 0, bt: 0, notPaid: 0 });
    toast.success("New entry added");
  };

  const clearAllData = () => {
    saveSales([]);
    reload();
    localStorage.removeItem("shop_data_initialized");
    toast.success("All sales data cleared");
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales Summary</h1>
          <p className="text-sm text-muted-foreground">{items.length} entries</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setAddingNew(true)} variant="default" className="gap-2" size="sm">
            <Plus className="h-4 w-4" /> Add Entry
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleMergeUpload} />
          <Button onClick={() => fileRef.current?.click()} variant="outline" className="gap-2" size="sm">
            <Upload className="h-4 w-4" /> Merge Upload
          </Button>
          <input ref={replaceFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleReplaceUpload} />
          <Button onClick={() => replaceFileRef.current?.click()} variant="outline" className="gap-2" size="sm">
            <RotateCcw className="h-4 w-4" /> Replace Upload
          </Button>
          {items.length > 0 && (
            <>
              <Button onClick={() => exportSalesXlsx(items)} variant="outline" className="gap-2" size="sm">
                <Download className="h-4 w-4" /> Export Excel
              </Button>
              <Button onClick={clearAllData} variant="ghost" className="gap-2 text-destructive" size="sm">
                <Trash2 className="h-4 w-4" /> Clear All
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Add New Entry Form */}
      {addingNew && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-4 rounded-lg border p-4">
          <h3 className="font-semibold text-sm mb-3">Add New Sales Entry</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Customer Name *</Label>
              <Input value={newForm.customerName || ""} onChange={(e) => setNewForm({ ...newForm, customerName: e.target.value })} placeholder="Customer name" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input value={newForm.date || ""} onChange={(e) => setNewForm({ ...newForm, date: e.target.value })} placeholder="e.g. 17/2/26" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Bill No.</Label>
              <Input value={newForm.billNo || ""} onChange={(e) => setNewForm({ ...newForm, billNo: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cash</Label>
              <NumberInput value={newForm.cash || 0} onValueChange={(v) => setNewForm({ ...newForm, cash: v })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">J.C</Label>
              <NumberInput value={newForm.jc || 0} onValueChange={(v) => setNewForm({ ...newForm, jc: v })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">E.P</Label>
              <NumberInput value={newForm.ep || 0} onValueChange={(v) => setNewForm({ ...newForm, ep: v })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">B.T</Label>
              <NumberInput value={newForm.bt || 0} onValueChange={(v) => setNewForm({ ...newForm, bt: v })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Not Paid</Label>
              <NumberInput value={newForm.notPaid || 0} onValueChange={(v) => setNewForm({ ...newForm, notPaid: v })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={() => setAddingNew(false)}>Cancel</Button>
            <Button size="sm" onClick={addNewEntry} disabled={!newForm.customerName?.trim()}>
              <Save className="h-4 w-4 mr-1" /> Save
            </Button>
          </div>
        </motion.div>
      )}

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by customer or bill no..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <FileSpreadsheet className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">
            {search ? "No entries match your search." : "No data loaded. Upload a Sales Summary Excel file."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Customer</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Bill No.</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Cash</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">J.C</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">E.P</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">B.T</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Not Paid</th>
                <th className="px-4 py-3 w-24 text-center font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry, i) => (
                <motion.tr
                  key={entry.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.01 }}
                  className="border-b last:border-0 transition-colors hover:bg-muted/30"
                >
                  {editingId === entry.id ? (
                    <>
                      <td className="px-2 py-1"><Input value={editForm.date || ""} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} className="h-8 text-xs" /></td>
                      <td className="px-2 py-1"><Input value={editForm.customerName || ""} onChange={(e) => setEditForm({ ...editForm, customerName: e.target.value })} className="h-8 text-xs" /></td>
                      <td className="px-2 py-1"><Input value={editForm.billNo || ""} onChange={(e) => setEditForm({ ...editForm, billNo: e.target.value })} className="h-8 text-xs" /></td>
                      <td className="px-2 py-1"><NumberInput value={editForm.cash || 0} onValueChange={(v) => setEditForm({ ...editForm, cash: v })} className="h-8 text-xs text-right" /></td>
                      <td className="px-2 py-1"><NumberInput value={editForm.jc || 0} onValueChange={(v) => setEditForm({ ...editForm, jc: v })} className="h-8 text-xs text-right" /></td>
                      <td className="px-2 py-1"><NumberInput value={editForm.ep || 0} onValueChange={(v) => setEditForm({ ...editForm, ep: v })} className="h-8 text-xs text-right" /></td>
                      <td className="px-2 py-1"><NumberInput value={editForm.bt || 0} onValueChange={(v) => setEditForm({ ...editForm, bt: v })} className="h-8 text-xs text-right" /></td>
                      <td className="px-2 py-1"><NumberInput value={editForm.notPaid || 0} onValueChange={(v) => setEditForm({ ...editForm, notPaid: v })} className="h-8 text-xs text-right" /></td>
                      <td className="px-2 py-1 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveEdit}><Save className="h-3.5 w-3.5 text-success" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /></Button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{entry.date}</td>
                      <td className="px-4 py-3 font-medium">{entry.customerName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{entry.billNo}</td>
                      <td className="px-4 py-3 text-right">{entry.cash ? `Rs ${entry.cash.toLocaleString()}` : "—"}</td>
                      <td className="px-4 py-3 text-right">{entry.jc ? `Rs ${entry.jc.toLocaleString()}` : "—"}</td>
                      <td className="px-4 py-3 text-right">{entry.ep ? `Rs ${entry.ep.toLocaleString()}` : "—"}</td>
                      <td className="px-4 py-3 text-right">{entry.bt ? `Rs ${entry.bt.toLocaleString()}` : "—"}</td>
                      <td className={`px-4 py-3 text-right font-medium ${entry.notPaid > 0 ? "text-destructive" : ""}`}>
                        {entry.notPaid ? `Rs ${entry.notPaid.toLocaleString()}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(entry)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteEntry(entry.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                        </div>
                      </td>
                    </>
                  )}
                </motion.tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/50 font-bold">
                <td colSpan={3} className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right">Rs {totals.cash.toLocaleString()}</td>
                <td className="px-4 py-3 text-right">Rs {totals.jc.toLocaleString()}</td>
                <td className="px-4 py-3 text-right">Rs {totals.ep.toLocaleString()}</td>
                <td className="px-4 py-3 text-right">Rs {totals.bt.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-destructive">Rs {totals.notPaid.toLocaleString()}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
