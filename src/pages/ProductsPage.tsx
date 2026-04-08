import { useState, useEffect, useRef } from "react";
import { offlineQuery } from "@/lib/offlineQuery";
import { Plus, Search, X, Package, Pencil, Trash2, Save, AlertTriangle, Download, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/customClient";
import { retryQuery, retryMutation } from "@/lib/retryFetch";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { NumberInput } from "@/components/NumberInput";
import { exportToExcel, importFromExcel } from "@/lib/exportUtils";
import { logAction } from "@/lib/auditLog";

interface Product {
  id: string; name: string; sku: string | null; category_id: string | null;
  purchase_price: number; selling_price: number; quantity: number; unit: string;
  alert_threshold: number; brand: string | null; description: string | null;
}

interface Category { id: string; name: string; }

const emptyForm = { name: "", sku: "", category_id: "", purchase_price: 0, selling_price: 0, quantity: 0, unit: "pcs", alert_threshold: 0, brand: "", description: "" };

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [prods, cats] = await Promise.all([
        offlineQuery<Product>("products", { order: "name" }),
        offlineQuery<Category>("product_categories", { order: "name" }),
      ]);
      setProducts(prods);
      setCategories(cats);
    } catch (e) {
      console.error("Products fetch error:", e);
      toast.error("Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase()) || p.brand?.toLowerCase().includes(search.toLowerCase())
  );

  const lowStock = filtered.filter((p) => p.alert_threshold > 0 && p.quantity <= p.alert_threshold);
  const totalValue = filtered.reduce((s, p) => s + p.quantity * p.selling_price, 0);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Product name is required"); return; }
    const payload = {
      name: form.name.trim(),
      sku: form.sku || null,
      category_id: form.category_id || null,
      purchase_price: form.purchase_price || 0,
      selling_price: form.selling_price || 0,
      quantity: form.quantity || 0,
      unit: form.unit || "pcs",
      alert_threshold: form.alert_threshold || 0,
      brand: form.brand || null,
      description: form.description || null,
    };

    if (editingId) {
      const { error } = await supabase.from("products").update(payload).eq("id", editingId);
      if (error) { toast.error("Failed to update"); return; }
      toast.success("Product updated");
      logAction("update", "product", editingId, `Updated product ${form.name}`);
    } else {
      const { data, error } = await supabase.from("products").insert(payload).select().single();
      if (error) { toast.error("Failed to add product"); return; }
      toast.success("Product added");
      logAction("create", "product", data?.id || "", `Added product ${form.name}`);
    }
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    fetchData();
  };

  const startEdit = (p: Product) => {
    setEditingId(p.id);
    setForm({ name: p.name, sku: p.sku || "", category_id: p.category_id || "", purchase_price: p.purchase_price, selling_price: p.selling_price, quantity: p.quantity, unit: p.unit, alert_threshold: p.alert_threshold, brand: p.brand || "", description: p.description || "" });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this product?")) return;
    const prod = products.find(p => p.id === id);
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) { toast.error("Failed to delete"); return; }
    toast.success("Product deleted");
    logAction("delete", "product", id, `Deleted product ${prod?.name || ""}`);
    fetchData();
  };

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    const { error } = await supabase.from("product_categories").insert({ name: newCatName.trim() });
    if (error) { toast.error("Failed to add category"); return; }
    toast.success("Category added");
    setNewCatName("");
    setCatDialogOpen(false);
    fetchData();
  };

  const getCategoryName = (id: string | null) => categories.find((c) => c.id === id)?.name || "—";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportExcel = () => {
    exportToExcel(filtered.map(p => ({
      Name: p.name, SKU: p.sku || "", Category: getCategoryName(p.category_id), Brand: p.brand || "",
      "Purchase Price": p.purchase_price, "Selling Price": p.selling_price, Quantity: p.quantity, Unit: p.unit, "Alert Threshold": p.alert_threshold,
    })), "Products");
  };


  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await importFromExcel<any>(file);
      let count = 0;
      for (const row of rows) {
        const name = row.Name || row.name;
        if (!name) continue;
        await supabase.from("products").insert({
          name, sku: row.SKU || row.sku || null, brand: row.Brand || row.brand || null,
          purchase_price: Number(row["Purchase Price"] || row.purchase_price || 0),
          selling_price: Number(row["Selling Price"] || row.selling_price || 0),
          quantity: Number(row.Quantity || row.quantity || 0),
          unit: row.Unit || row.unit || "pcs",
          alert_threshold: Number(row["Alert Threshold"] || row.alert_threshold || 0),
        });
        count++;
      }
      toast.success(`Imported ${count} products`);
      fetchData();
    } catch { toast.error("Failed to import"); }
    e.target.value = "";
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">{products.length} products · Stock value: Rs {totalValue.toLocaleString()}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input type="file" accept=".xlsx,.xls" className="hidden" ref={fileInputRef} onChange={handleImport} />
          <Button size="sm" variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()}><Upload className="h-4 w-4" /> Import</Button>
          <Button size="sm" variant="outline" className="gap-2" onClick={handleExportExcel} disabled={filtered.length === 0}><Download className="h-4 w-4" /> Excel</Button>
          
          <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
            <DialogTrigger asChild><Button variant="outline" size="sm" className="gap-2"><Plus className="h-4 w-4" /> Category</Button></DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>Add Category</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Category name" />
                <Button onClick={addCategory} className="w-full">Save</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setEditingId(null); setForm(emptyForm); } }}>
            <DialogTrigger asChild><Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> Add Product</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editingId ? "Edit Product" : "Add Product"}</DialogTitle></DialogHeader>
              <div className="grid gap-3 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                  <div className="space-y-1"><Label>SKU</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Category</Label>
                    <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1"><Label>Brand</Label><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1"><Label>Purchase Price</Label><NumberInput value={form.purchase_price} onValueChange={(v) => setForm({ ...form, purchase_price: v })} /></div>
                  <div className="space-y-1"><Label>Selling Price</Label><NumberInput value={form.selling_price} onValueChange={(v) => setForm({ ...form, selling_price: v })} /></div>
                  <div className="space-y-1"><Label>Quantity</Label><NumberInput value={form.quantity} onValueChange={(v) => setForm({ ...form, quantity: v })} /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1"><Label>Unit</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="pcs, kg, etc." /></div>
                  <div className="space-y-1"><Label>Alert Threshold</Label><NumberInput value={form.alert_threshold} onValueChange={(v) => setForm({ ...form, alert_threshold: v })} /></div>
                </div>
                <Button onClick={handleSave} className="gap-2"><Save className="h-4 w-4" /> {editingId ? "Update" : "Save"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <span className="text-sm text-destructive font-medium">{lowStock.length} product(s) low on stock: {lowStock.map(p => p.name).join(", ")}</span>
        </div>
      )}

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Package className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">{search ? "No products match your search." : "No products yet."}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Product</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">SKU</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Category</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Purchase</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Selling</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Stock</th>
                <th className="px-4 py-3 w-24 text-center font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <motion.tr key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.01 }} className={`border-b last:border-0 hover:bg-muted/30 ${p.alert_threshold > 0 && p.quantity <= p.alert_threshold ? "bg-destructive/5" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.name}</div>
                    {p.brand && <div className="text-xs text-muted-foreground">{p.brand}</div>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.sku || "—"}</td>
                  <td className="px-4 py-3"><Badge variant="secondary">{getCategoryName(p.category_id)}</Badge></td>
                  <td className="px-4 py-3 text-right">Rs {Number(p.purchase_price).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">Rs {Number(p.selling_price).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={p.alert_threshold > 0 && p.quantity <= p.alert_threshold ? "text-destructive font-bold" : ""}>{p.quantity} {p.unit}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(p.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
