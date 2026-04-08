import { useState, useEffect } from "react";
import { offlineQuery } from "@/lib/offlineQuery";
import { useSearchParams } from "react-router-dom";
import { Plus, Search, X, ShoppingCart, Trash2, Save, Pencil, Eye, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/customClient";
import { retryQuery, retryMutation } from "@/lib/retryFetch";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { logAction } from "@/lib/auditLog";
import { NumberInput } from "@/components/NumberInput";
import { exportToExcel, importFromExcel } from "@/lib/exportUtils";
import { useRef } from "react";

interface Purchase {
  id: string; supplier_id: string | null; date: string; reference_no: string | null;
  total: number; discount: number; payment_status: string; payment_method: string;
  notes: string | null; created_at: string;
}

interface PurchaseItem {
  id: string; product_id: string | null; quantity: number; unit_price: number; subtotal: number;
}

interface Supplier { id: string; name: string; }
interface Product { id: string; name: string; purchase_price: number; quantity: number; }
interface CartItem { product_id: string; product_name: string; quantity: number; unit_price: number; subtotal: number; }

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // New purchase form
  const [supplierId, setSupplierId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [refNo, setRefNo] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("due");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [discount, setDiscount] = useState(0);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [qty, setQty] = useState(1);

  // Edit state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [editForm, setEditForm] = useState({ supplier_id: "", date: "", reference_no: "", payment_status: "", payment_method: "", discount: 0 });

  // View state
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewPurchase, setViewPurchase] = useState<Purchase | null>(null);
  const [viewItems, setViewItems] = useState<(PurchaseItem & { product_name?: string })[]>([]);

  // Delete state
  const [deletePurchase, setDeletePurchase] = useState<Purchase | null>(null);
  const [deleting, setDeleting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const handleImportPurchases = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      const rows = await importFromExcel<any>(file);
      let count = 0;
      for (const row of rows) {
        const total = Number(row.Total || row.total || row.Amount || row.amount || 0);
        if (!total) continue;
        const supplierName = row.Supplier || row.supplier || "";
        let suppId: string | null = null;
        if (supplierName) {
          const match = suppliers.find(s => s.name.toLowerCase() === supplierName.toLowerCase());
          if (match) suppId = match.id;
        }
        await supabase.from("purchases").insert({
          date: row.Date || row.date || new Date().toISOString().split("T")[0],
          supplier_id: suppId,
          total,
          discount: Number(row.Discount || row.discount || 0),
          reference_no: row["Reference No"] || row.reference_no || null,
          payment_method: row["Payment Method"] || row.payment_method || "cash",
          payment_status: row["Payment Status"] || row.payment_status || "due",
          notes: row.Notes || row.notes || null,
        });
        count++;
      }
      toast.success(`Imported ${count} purchases`);
      fetchData();
    } catch { toast.error("Failed to import purchases"); }
    ev.target.value = "";
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [purch, supps, prods] = await Promise.all([
        offlineQuery<Purchase>("purchases", { order: "date", ascending: false }),
        offlineQuery<Supplier>("contacts", { select: "id, name", eq: { type: "supplier" }, order: "name" }),
        offlineQuery<Product>("products", { select: "id, name, purchase_price, quantity", order: "name" }),
      ]);
      setPurchases(purch);
      setSuppliers(supps);
      setProducts(prods);
    } catch (e) {
      console.error("Purchases fetch error:", e);
      toast.error("Failed to load purchases");
    } finally {
      setLoading(false);
    }
  };

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => { fetchData(); }, []);

  // Handle reorder from low stock alert
  useEffect(() => {
    const reorderId = searchParams.get("reorder");
    const productName = searchParams.get("product");
    const reorderQty = searchParams.get("qty");
    const reorderPrice = searchParams.get("price");
    if (reorderId && productName) {
      setCart([{
        product_id: reorderId,
        product_name: decodeURIComponent(productName),
        quantity: Number(reorderQty) || 10,
        unit_price: Number(reorderPrice) || 0,
        subtotal: (Number(reorderQty) || 10) * (Number(reorderPrice) || 0),
      }]);
      setDialogOpen(true);
      setSearchParams({});
    }
  }, [searchParams]);

  const filtered = purchases.filter((p) =>
    p.reference_no?.toLowerCase().includes(search.toLowerCase()) ||
    suppliers.find((s) => s.id === p.supplier_id)?.name.toLowerCase().includes(search.toLowerCase())
  );

  const addToCart = () => {
    const prod = products.find((p) => p.id === selectedProduct);
    if (!prod) return;
    const existing = cart.find((c) => c.product_id === prod.id);
    if (existing) {
      setCart(cart.map((c) => c.product_id === prod.id ? { ...c, quantity: c.quantity + qty, subtotal: (c.quantity + qty) * c.unit_price } : c));
    } else {
      setCart([...cart, { product_id: prod.id, product_name: prod.name, quantity: qty, unit_price: prod.purchase_price, subtotal: qty * prod.purchase_price }]);
    }
    setSelectedProduct("");
    setQty(1);
  };

  const cartTotal = cart.reduce((s, c) => s + c.subtotal, 0) - discount;

  const handleSave = async () => {
    if (cart.length === 0) { toast.error("Add at least one product"); return; }
    const { data: purchase, error } = await supabase.from("purchases").insert({
      supplier_id: supplierId || null, date, reference_no: refNo || null,
      total: cartTotal, discount, payment_status: paymentStatus, payment_method: paymentMethod,
    }).select().single();

    if (error || !purchase) { toast.error("Failed to create purchase"); return; }

    const items = cart.map((c) => ({ purchase_id: purchase.id, product_id: c.product_id, quantity: c.quantity, unit_price: c.unit_price, subtotal: c.subtotal }));
    const { error: itemsErr } = await supabase.from("purchase_items").insert(items);
    if (itemsErr) { toast.error("Failed to save items"); return; }

    // Update product stock
    for (const item of cart) {
      const prod = products.find((p) => p.id === item.product_id);
      if (prod) {
        await supabase.from("products").update({ quantity: prod.quantity + item.quantity }).eq("id", item.product_id);
      }
    }

    toast.success("Purchase recorded");
    logAction("create", "purchase", purchase.id, `Purchase Rs ${cartTotal} from ${getSupplierName(supplierId || null)}`);
    setDialogOpen(false); setCart([]); setSupplierId(""); setRefNo(""); setDiscount(0);
    fetchData();
  };

  const getSupplierName = (id: string | null) => suppliers.find((s) => s.id === id)?.name || "Walk-in";
  const statusColor = (s: string) => s === "paid" ? "default" : s === "partial" ? "secondary" : "destructive";

  // View purchase details
  const handleView = async (p: Purchase) => {
    setViewPurchase(p);
    const { data } = await supabase.from("purchase_items").select("*").eq("purchase_id", p.id);
    const itemsWithNames = (data || []).map((item: any) => ({
      ...item,
      product_name: products.find((pr) => pr.id === item.product_id)?.name || "Unknown Product",
    }));
    setViewItems(itemsWithNames);
    setViewDialogOpen(true);
  };

  // Edit purchase
  const startEdit = (p: Purchase) => {
    setEditingPurchase(p);
    setEditForm({
      supplier_id: p.supplier_id || "",
      date: p.date,
      reference_no: p.reference_no || "",
      payment_status: p.payment_status,
      payment_method: p.payment_method,
      discount: Number(p.discount) || 0,
    });
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    if (!editingPurchase) return;
    const { error } = await supabase.from("purchases").update({
      supplier_id: editForm.supplier_id || null,
      date: editForm.date,
      reference_no: editForm.reference_no || null,
      payment_status: editForm.payment_status,
      payment_method: editForm.payment_method,
      discount: editForm.discount,
    }).eq("id", editingPurchase.id);

    if (error) { toast.error("Failed to update purchase"); return; }
    toast.success("Purchase updated");
    logAction("update", "purchase", editingPurchase.id, `Updated purchase Rs ${Number(editingPurchase.total).toLocaleString()}`);
    setEditDialogOpen(false);
    setEditingPurchase(null);
    fetchData();
  };

  // Delete purchase
  const handleDelete = async () => {
    if (!deletePurchase) return;
    setDeleting(true);
    try {
      // Reverse stock for purchase items
      const { data: items } = await supabase.from("purchase_items").select("*").eq("purchase_id", deletePurchase.id);
      if (items) {
        for (const item of items) {
          const prod = products.find((p) => p.id === item.product_id);
          if (prod) {
            const newQty = Math.max(0, prod.quantity - Number(item.quantity));
            await supabase.from("products").update({ quantity: newQty }).eq("id", item.product_id);
          }
        }
      }

      await supabase.from("purchase_items").delete().eq("purchase_id", deletePurchase.id);
      const { error } = await supabase.from("purchases").delete().eq("id", deletePurchase.id);
      if (error) throw error;

      logAction("delete", "purchase", deletePurchase.id, `Deleted purchase Rs ${Number(deletePurchase.total).toLocaleString()} from ${getSupplierName(deletePurchase.supplier_id)}`);
      toast.success("Purchase deleted & stock reversed");
      setDeletePurchase(null);
      fetchData();
    } catch (e) {
      console.error("Delete purchase error:", e);
      toast.error("Failed to delete purchase");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Purchases</h1>
          <p className="text-sm text-muted-foreground">{purchases.length} purchase orders</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input type="file" accept=".xlsx,.xls" className="hidden" ref={importRef} onChange={handleImportPurchases} />
          <Button size="sm" variant="outline" className="gap-2" onClick={() => importRef.current?.click()}>
            <Upload className="h-4 w-4" /> Import
          </Button>
          <Button size="sm" variant="outline" className="gap-2" disabled={filtered.length === 0} onClick={() => {
            exportToExcel(filtered.map(p => ({
              Date: p.date, Supplier: getSupplierName(p.supplier_id), "Reference No": p.reference_no || "",
              "Payment Status": p.payment_status, "Payment Method": p.payment_method,
              Discount: Number(p.discount), Total: Number(p.total),
            })), "Purchases");
          }}><Download className="h-4 w-4" /> Excel</Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> New Purchase</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>New Purchase Order</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Supplier</Label>
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1"><Label>Reference No</Label><Input value={refNo} onChange={(e) => setRefNo(e.target.value)} /></div>
                <div className="space-y-1">
                  <Label>Payment Status</Label>
                  <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="due">Due</SelectItem>
                      <SelectItem value="partial">Partial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
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

              <div className="border rounded-lg p-3 space-y-3">
                <h4 className="font-semibold text-sm">Add Products</h4>
                <div className="flex gap-2">
                  <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Select product" /></SelectTrigger>
                    <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — Rs {p.purchase_price}</SelectItem>)}</SelectContent>
                  </Select>
                  <NumberInput value={qty} onValueChange={setQty} className="w-20" min={1} />
                  <Button onClick={addToCart} disabled={!selectedProduct}>Add</Button>
                </div>
                {cart.length > 0 && (
                  <table className="w-full text-sm">
                    <thead><tr className="border-b"><th className="text-left py-1">Product</th><th className="text-right py-1">Qty</th><th className="text-right py-1">Price</th><th className="text-right py-1">Subtotal</th><th className="w-8"></th></tr></thead>
                    <tbody>
                      {cart.map((c, i) => (
                        <tr key={i} className="border-b">
                          <td className="py-1">{c.product_name}</td>
                          <td className="text-right py-1">{c.quantity}</td>
                          <td className="text-right py-1">Rs {c.unit_price.toLocaleString()}</td>
                          <td className="text-right py-1">Rs {c.subtotal.toLocaleString()}</td>
                          <td><Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setCart(cart.filter((_, j) => j !== i))}><X className="h-3 w-3" /></Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="flex justify-between items-center">
                  <div className="space-y-1"><Label className="text-xs">Discount</Label><NumberInput value={discount} onValueChange={setDiscount} className="w-32 h-8" /></div>
                  <div className="text-right"><p className="text-xs text-muted-foreground">Total</p><p className="text-lg font-bold">Rs {cartTotal.toLocaleString()}</p></div>
                </div>
              </div>

              <Button onClick={handleSave} className="gap-2"><Save className="h-4 w-4" /> Save Purchase</Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search purchases..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <ShoppingCart className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">No purchases yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Supplier</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Ref No</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
                <th className="px-4 py-3 w-28 text-center font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <motion.tr key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.01 }} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">{p.date}</td>
                  <td className="px-4 py-3 font-medium">{getSupplierName(p.supplier_id)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.reference_no || "—"}</td>
                  <td className="px-4 py-3"><Badge variant={statusColor(p.payment_status)}>{p.payment_status}</Badge></td>
                  <td className="px-4 py-3 text-right font-medium">Rs {Number(p.total).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-0.5">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleView(p)} title="View Details">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(p)} title="Edit Purchase">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDeletePurchase(p)} title="Delete Purchase">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* View Purchase Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Purchase Details</DialogTitle></DialogHeader>
          {viewPurchase && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{viewPurchase.date}</span></div>
                <div><span className="text-muted-foreground">Supplier:</span> <span className="font-medium">{getSupplierName(viewPurchase.supplier_id)}</span></div>
                <div><span className="text-muted-foreground">Ref No:</span> <span className="font-medium">{viewPurchase.reference_no || "—"}</span></div>
                <div><span className="text-muted-foreground">Method:</span> <span className="font-medium capitalize">{viewPurchase.payment_method}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <Badge variant={statusColor(viewPurchase.payment_status)} className="ml-1 capitalize text-xs">{viewPurchase.payment_status}</Badge></div>
                <div><span className="text-muted-foreground">Discount:</span> <span className="font-medium">Rs {Number(viewPurchase.discount).toLocaleString()}</span></div>
              </div>
              {viewItems.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/50"><th className="px-3 py-2 text-left">Product</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2 text-right">Subtotal</th></tr></thead>
                    <tbody>
                      {viewItems.map((item) => (
                        <tr key={item.id} className="border-b last:border-0">
                          <td className="px-3 py-2">{item.product_name}</td>
                          <td className="px-3 py-2 text-right">{Number(item.quantity)}</td>
                          <td className="px-3 py-2 text-right">Rs {Number(item.unit_price).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-medium">Rs {Number(item.subtotal).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="text-right text-lg font-bold">Total: Rs {Number(viewPurchase.total).toLocaleString()}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Purchase Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Purchase</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1">
              <Label>Supplier</Label>
              <Select value={editForm.supplier_id} onValueChange={(v) => setEditForm({ ...editForm, supplier_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Reference No</Label>
              <Input value={editForm.reference_no} onChange={(e) => setEditForm({ ...editForm, reference_no: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Payment Status</Label>
                <Select value={editForm.payment_status} onValueChange={(v) => setEditForm({ ...editForm, payment_status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="due">Due</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Payment Method</Label>
                <Select value={editForm.payment_method} onValueChange={(v) => setEditForm({ ...editForm, payment_method: v })}>
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
            <div className="space-y-1">
              <Label>Discount</Label>
              <NumberInput value={editForm.discount} onValueChange={(v) => setEditForm({ ...editForm, discount: v })} />
            </div>
            <Button onClick={handleEditSave} className="gap-2"><Save className="h-4 w-4" /> Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletePurchase} onOpenChange={(open) => !open && setDeletePurchase(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this purchase (Rs {Number(deletePurchase?.total || 0).toLocaleString()}) from {getSupplierName(deletePurchase?.supplier_id || null)} and reverse the stock quantities. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
