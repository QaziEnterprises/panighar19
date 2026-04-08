import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Search, X, Bell, Download, Upload } from "lucide-react";
import { exportToExcel, importFromExcel } from "@/lib/exportUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { InventoryItem } from "@/types";
import {
  getInventory, addInventoryItem, updateInventoryItem, deleteInventoryItem,
} from "@/lib/store";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { NumberInput } from "@/components/NumberInput";

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState({ name: "", quantity: "", price: "", alertThreshold: "" });

  const reload = () => setItems(getInventory());
  useEffect(reload, []);

  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", quantity: "", price: "", alertThreshold: "" });
    setDialogOpen(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditing(item);
    setForm({
      name: item.name,
      quantity: String(item.quantity),
      price: String(item.price),
      alertThreshold: String((item as any).alertThreshold || ""),
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    const name = form.name.trim();
    const quantity = parseInt(form.quantity) || 0;
    const price = parseFloat(form.price) || 0;
    const alertThreshold = parseInt(form.alertThreshold) || 0;
    if (!name) { toast.error("Item name is required"); return; }

    if (editing) {
      updateInventoryItem(editing.id, { name, quantity, price, alertThreshold } as any);
      toast.success("Item updated");
    } else {
      addInventoryItem({ name, quantity, price, alertThreshold } as any);
      toast.success("Item added");
    }
    setDialogOpen(false);
    reload();
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("Are you sure you want to delete this item?")) return;
    deleteInventoryItem(id);
    toast.success("Item removed");
    reload();
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground">{items.length} items in stock</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label>
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const rows = await importFromExcel<any>(file);
                let count = 0;
                for (const row of rows) {
                  const name = row.Name || row.name;
                  if (!name) continue;
                  addInventoryItem({
                    name, quantity: Number(row.Quantity || row.quantity || 0),
                    price: Number(row.Price || row.price || 0),
                    alertThreshold: Number(row["Alert Threshold"] || row.alertThreshold || 0),
                  } as any);
                  count++;
                }
                toast.success(`Imported ${count} items`);
                reload();
              } catch { toast.error("Failed to import"); }
              e.target.value = "";
            }} />
            <Button variant="outline" size="sm" className="gap-2" asChild><span><Upload className="h-4 w-4" /> Import</span></Button>
          </label>
          <Button variant="outline" size="sm" className="gap-2" disabled={items.length === 0} onClick={() => {
            exportToExcel(items.map(i => ({
              Name: i.name, Quantity: i.quantity, Price: i.price,
              Value: i.quantity * i.price, "Alert Threshold": (i as any).alertThreshold || 0,
            })), "inventory", "Inventory");
            toast.success("Exported to Excel");
          }}><Download className="h-4 w-4" /> Excel</Button>
          <Button onClick={openAdd} className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
            <Plus className="h-4 w-4" /> Add Item
          </Button>
        </div>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">
            {search ? "No items match your search." : "No items yet. Click \"Add Item\" to get started."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Item Name</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Quantity</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Price</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Value</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Alert</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filtered.map((item) => {
                  const threshold = (item as any).alertThreshold || 0;
                  const isLow = threshold > 0 && item.quantity <= threshold;
                  return (
                    <motion.tr
                      key={item.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className={`border-b last:border-0 transition-colors hover:bg-muted/30 ${isLow ? "bg-destructive/5" : ""}`}
                    >
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          {item.name}
                          {isLow && <Bell className="h-3.5 w-3.5 text-destructive animate-pulse" />}
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-right ${isLow ? "text-destructive font-bold" : ""}`}>{item.quantity.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">Rs {item.price.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-medium">Rs {(item.quantity * item.price).toLocaleString()}</td>
                      <td className="px-4 py-3 text-center">
                        {threshold > 0 ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${isLow ? "bg-destructive/20 text-destructive" : "bg-muted text-muted-foreground"}`}>
                            ≤ {threshold}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(item)} className="h-8 w-8">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)} className="h-8 w-8 text-destructive hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Item" : "Add New Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Item Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Water Bottle 500ml" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <NumberInput value={parseInt(form.quantity) || 0} onValueChange={(v) => setForm({ ...form, quantity: String(v) })} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>Price (Rs)</Label>
                <NumberInput value={parseFloat(form.price) || 0} onValueChange={(v) => setForm({ ...form, price: String(v) })} placeholder="0" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-warning" /> Low Stock Alert Threshold
              </Label>
              <Input
                type="number"
                value={form.alertThreshold}
                onChange={(e) => setForm({ ...form, alertThreshold: e.target.value })}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">Set a number to get alerted when stock falls to or below this quantity</p>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSave} className="bg-accent text-accent-foreground hover:bg-accent/90">
              {editing ? "Save Changes" : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
