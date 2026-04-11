import { useState, useEffect, useRef, useMemo } from "react";
import { offlineQuery } from "@/lib/offlineQuery";
import {
  Search, X, ShoppingBag, Plus, Minus, Trash2, CreditCard, Printer,
  MessageCircle, ScanLine, UserPlus, Package, ChevronDown, ChevronUp,
  Receipt, Wallet, Star, Hash, Tag, Calendar, Calculator,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { logAction } from "@/lib/auditLog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/customClient";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { NumberInput } from "@/components/NumberInput";
import BarcodeScanner from "@/components/BarcodeScanner";
import CustomerAutocomplete from "@/components/CustomerAutocomplete";
import ProductAutocomplete from "@/components/ProductAutocomplete";

// ── Types ──
interface Product { id: string; name: string; selling_price: number; quantity: number; sku: string | null; }
interface Customer { id: string; name: string; phone: string | null; current_balance?: number; }
interface CartItem { product_id: string | null; name: string; quantity: number; unit_price: number; subtotal: number; max_stock: number; is_custom?: boolean; }
interface SplitPayment { method: string; amount: number; }
interface SaleInvoice {
  invoice_no: string; date: string; customer_name: string; items: CartItem[];
  subtotal: number; discount: number; total: number; paid_amount: number;
  payment_method: string; payment_status: string; split_payments?: SplitPayment[];
  overpayment?: number;
}

const POS_DRAFT_KEY = "pos_draft_bill";
function loadDraft() {
  try { const raw = sessionStorage.getItem(POS_DRAFT_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export default function POSPage() {
  const { role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const draft = loadDraft();
  const [cart, setCart] = useState<CartItem[]>(draft?.cart || []);
  const [customerId, setCustomerId] = useState(draft?.customerId || "");
  const [customerNameInput, setCustomerNameInput] = useState(draft?.customerNameInput || "Cash Sale");
  const [discount, setDiscount] = useState(draft?.discount || 0);
  const [paymentMethod, setPaymentMethod] = useState(draft?.paymentMethod || "cash");
  const [paymentStatus, setPaymentStatus] = useState(draft?.paymentStatus || "paid");
  const [notes, setNotes] = useState(draft?.notes || "");
  const [processing, setProcessing] = useState(false);
  const [invoiceData, setInvoiceData] = useState<SaleInvoice | null>(null);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try { const saved = localStorage.getItem("pos_pinned_products"); return saved ? new Set(JSON.parse(saved)) : new Set<string>(); } catch { return new Set<string>(); }
  });
  const printRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [customProductName, setCustomProductName] = useState("");
  const [customProductQty, setCustomProductQty] = useState(1);
  const [customProductPrice, setCustomProductPrice] = useState(0);
  const [showCustomEntry, setShowCustomEntry] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, number>>(
    draft?.paymentAmounts || { cash: 0, bank: 0, jazzcash: 0, easypaisa: 0 }
  );
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [saleDate, setSaleDate] = useState(draft?.saleDate || new Date().toISOString().split("T")[0]);
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcDisplay, setCalcDisplay] = useState("0");
  const [calcPrev, setCalcPrev] = useState<number | null>(null);
  const [calcOp, setCalcOp] = useState<string | null>(null);
  const [calcNewNum, setCalcNewNum] = useState(true);

  // Calculator functions
  const calcPress = (key: string) => {
    if (key >= "0" && key <= "9" || key === ".") {
      setCalcDisplay(prev => calcNewNum ? key : prev === "0" && key !== "." ? key : prev + key);
      setCalcNewNum(false);
    } else if (["+", "-", "×", "÷"].includes(key)) {
      setCalcPrev(parseFloat(calcDisplay));
      setCalcOp(key);
      setCalcNewNum(true);
    } else if (key === "=") {
      if (calcPrev !== null && calcOp) {
        const cur = parseFloat(calcDisplay);
        let result = 0;
        if (calcOp === "+") result = calcPrev + cur;
        else if (calcOp === "-") result = calcPrev - cur;
        else if (calcOp === "×") result = calcPrev * cur;
        else if (calcOp === "÷") result = cur !== 0 ? calcPrev / cur : 0;
        setCalcDisplay(String(Math.round(result * 100) / 100));
        setCalcPrev(null);
        setCalcOp(null);
        setCalcNewNum(true);
      }
    } else if (key === "C") {
      setCalcDisplay("0");
      setCalcPrev(null);
      setCalcOp(null);
      setCalcNewNum(true);
    }
  };

  // Combined price feature: user types total price for a cart item, auto-calc unit price
  const setCombinedPrice = (index: number, combinedPrice: number) => {
    setCart(cart.map((c, idx) => {
      if (idx !== index) return c;
      const unitPrice = c.quantity > 0 ? Math.round((combinedPrice / c.quantity) * 100) / 100 : 0;
      return { ...c, unit_price: unitPrice, subtotal: combinedPrice };
    }));
  };

  // ── Draft persistence ──
  useEffect(() => {
    sessionStorage.setItem(POS_DRAFT_KEY, JSON.stringify({ cart, customerId, customerNameInput, discount, paymentMethod, paymentStatus, notes, paymentAmounts, saleDate }));
  }, [cart, customerId, customerNameInput, discount, paymentMethod, paymentStatus, notes, paymentAmounts, saleDate]);

  // ── Data Fetch (with offline fallback) ──
  useEffect(() => {
    (async () => {
      try {
        const [prods, custs] = await Promise.all([
          offlineQuery<Product>("products", { select: "id, name, selling_price, quantity, sku", order: "name" }),
          offlineQuery<Customer>("contacts", { select: "id, name, phone, current_balance", eq: { type: "customer" }, order: "name" }),
        ]);
        setProducts(prods); setCustomers(custs);
      } catch (e) { console.error("POS fetch error:", e); toast.error("Failed to load data"); }
      finally { setLoading(false); }
    })();
  }, []);

  // ── Product filtering ──
  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase())
  );
  const togglePin = (id: string) => {
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem("pos_pinned_products", JSON.stringify([...next]));
      return next;
    });
  };
  const sortedProducts = useMemo(() => [...filteredProducts].sort((a, b) => (pinnedIds.has(a.id) ? 0 : 1) - (pinnedIds.has(b.id) ? 0 : 1)), [filteredProducts, pinnedIds]);

  // ── Cart Logic ──
  const addToCart = (product: Product) => {
    const existing = cart.find((c) => c.product_id === product.id && !c.is_custom);
    if (existing) {
      if (existing.quantity >= product.quantity) { toast.error("Not enough stock"); return; }
      setCart(cart.map((c) => c.product_id === product.id && !c.is_custom ? { ...c, quantity: c.quantity + 1, subtotal: (c.quantity + 1) * c.unit_price } : c));
    } else {
      if (product.quantity <= 0) { toast.error("Out of stock"); return; }
      setCart([...cart, { product_id: product.id, name: product.name, quantity: 1, unit_price: product.selling_price, subtotal: product.selling_price, max_stock: product.quantity }]);
    }
  };
  const addCustomProduct = () => {
    if (!customProductName.trim()) { toast.error("Enter product name"); return; }
    if (customProductPrice <= 0) { toast.error("Enter a valid price"); return; }
    setCart([...cart, { product_id: null, name: customProductName.trim(), quantity: customProductQty, unit_price: customProductPrice, subtotal: customProductQty * customProductPrice, max_stock: 9999, is_custom: true }]);
    setCustomProductName(""); setCustomProductQty(1); setCustomProductPrice(0); setShowCustomEntry(false);
    toast.success("Custom item added");
  };
  const addNewCustomer = async () => {
    if (!newCustomerName.trim()) { toast.error("Enter customer name"); return; }
    const { data, error } = await supabase.from("contacts").insert({ name: newCustomerName.trim(), type: "customer", phone: newCustomerPhone || null, opening_balance: 0, current_balance: 0 }).select("id, name, phone, current_balance").single();
    if (error) { toast.error("Failed to add customer"); return; }
    setCustomers([...customers, data]); setCustomerId(data.id); setCustomerNameInput(data.name);
    setNewCustomerName(""); setNewCustomerPhone(""); setShowNewCustomer(false);
    toast.success(`Customer "${data.name}" added`);
    logAction("create", "contact", data.id, `Added customer ${data.name} from POS`);
  };
  const updateQty = (i: number, delta: number) => setCart(cart.map((c, idx) => idx !== i ? c : { ...c, quantity: Math.max(1, Math.min(c.max_stock, c.quantity + delta)), subtotal: Math.max(1, Math.min(c.max_stock, c.quantity + delta)) * c.unit_price }));
  const updateUnitPrice = (i: number, price: number) => setCart(cart.map((c, idx) => idx !== i ? c : { ...c, unit_price: price, subtotal: c.quantity * price }));
  const updateItemQty = (i: number, qty: number) => setCart(cart.map((c, idx) => { if (idx !== i) return c; const q = Math.max(0.01, Math.min(c.max_stock, qty)); return { ...c, quantity: q, subtotal: q * c.unit_price }; }));
  const removeFromCart = (i: number) => setCart(cart.filter((_, idx) => idx !== i));

  const subtotal = cart.reduce((s, c) => s + c.subtotal, 0);
  const total = subtotal - discount;
  const updatePaymentAmount = (method: string, amount: number) => setPaymentAmounts(prev => ({ ...prev, [method]: amount }));
  const paidTotal = Object.values(paymentAmounts).reduce((s, v) => s + v, 0);
  const paidRemaining = total - paidTotal;
  const overpayment = paidTotal > total && total > 0 ? paidTotal - total : 0;
  const activePayments = Object.entries(paymentAmounts).filter(([, v]) => v > 0);

  const resolveCustomerName = (): string => {
    if (customerId) return customers.find(c => c.id === customerId)?.name || "Cash Sale";
    if (customerNameInput.trim()) return customerNameInput.trim();
    return "Cash Sale";
  };
  const resolvePaymentMethod = (): string => {
    if (activePayments.length > 1) return activePayments.map(([m, a]) => `${m}:${a}`).join(", ");
    if (activePayments.length === 1) return activePayments[0][0];
    return paymentMethod;
  };

  // ── Checkout ──
  const handleCheckout = async () => {
    if (cart.length === 0) { toast.error("Cart is empty"); return; }
    let finalPaymentStatus = paymentStatus;
    let paidAmount = 0;
    if (paymentStatus === "paid") { finalPaymentStatus = "paid"; paidAmount = total; }
    else if (paymentStatus === "due") { finalPaymentStatus = "due"; paidAmount = 0; }
    if (paymentStatus !== "due" && showBreakdown && paidTotal > 0) {
      paidAmount = Math.min(paidTotal, total);
      finalPaymentStatus = paidTotal >= total ? "paid" : paidTotal > 0 ? "partial" : "due";
    }
    let finalCustomerId = customerId || null;
    if (!finalCustomerId && customerNameInput.trim()) {
      const existing = customers.find(c => c.name.toLowerCase() === customerNameInput.trim().toLowerCase());
      if (existing) { finalCustomerId = existing.id; }
      else {
        const { data, error } = await supabase.from("contacts").insert({ name: customerNameInput.trim().replace(/\b\w/g, c => c.toUpperCase()), type: "customer", opening_balance: 0, current_balance: 0 }).select("id, name, phone, current_balance").single();
        if (!error && data) { finalCustomerId = data.id; setCustomers(prev => [...prev, data]); toast.info(`Customer "${data.name}" auto-created`); }
      }
    }
    if (overpayment > 0 && !finalCustomerId) { toast.error("Overpayment requires a customer"); return; }
    setProcessing(true);
    const payMethodStr = resolvePaymentMethod();
    const splitInfo = activePayments.length > 0 ? activePayments.map(([m, a]) => ({ method: m, amount: a })) : undefined;
    let notesWithSplit = notes || "";
    if (splitInfo && splitInfo.length > 0) {
      notesWithSplit = `${notes ? notes + " | " : ""}Payment: ${splitInfo.map(sp => `${sp.method}: PKR ${sp.amount.toLocaleString()}`).join(", ")}`;
      if (finalPaymentStatus === "partial") notesWithSplit += ` | Paid: PKR ${paidAmount.toLocaleString()} | Remaining: PKR ${(total - paidAmount).toLocaleString()}`;
      if (overpayment > 0) notesWithSplit += ` | Advance/Credit: PKR ${overpayment.toLocaleString()}`;
    }
    const { data: sale, error } = await supabase.from("sale_transactions").insert({ customer_id: finalCustomerId, subtotal, discount, total, paid_amount: paidAmount, payment_method: payMethodStr, payment_status: finalPaymentStatus, notes: notesWithSplit || null, date: saleDate }).select().single();
    if (error || !sale) { toast.error("Failed to process sale"); setProcessing(false); return; }
    await supabase.from("sale_items").insert(cart.map((c) => ({ sale_id: sale.id, product_id: c.product_id || null, product_name: c.name, quantity: c.quantity, unit_price: c.unit_price, subtotal: c.subtotal })));
    for (const ci of cart) {
      if (ci.product_id && !ci.is_custom) {
        const prod = products.find((p) => p.id === ci.product_id);
        if (prod) await supabase.from("products").update({ quantity: prod.quantity - ci.quantity }).eq("id", ci.product_id);
      }
    }
    if (finalCustomerId) {
      const itemNames = cart.map(c => c.name).join(", ");
      const description = `Sale ${sale.invoice_no || ""} - ${itemNames}`.substring(0, 500);
      const { data: lastEntry } = await supabase.from("ledger_entries").select("balance").eq("contact_id", finalCustomerId).order("date", { ascending: false }).order("created_at", { ascending: false }).limit(1);
      const prevBalance = lastEntry && lastEntry.length > 0 ? Number(lastEntry[0].balance) || 0 : 0;
      if (overpayment > 0) {
        const balAfterSale = prevBalance + total;
        await supabase.from("ledger_entries").insert({ contact_id: finalCustomerId, date: saleDate, description, debit: 0, credit: total, balance: balAfterSale, reference_type: "sale", reference_id: sale.id });
        const balAfterCredit = balAfterSale - overpayment;
        await supabase.from("ledger_entries").insert({ contact_id: finalCustomerId, date: saleDate, description: `Advance payment (overpayment on ${sale.invoice_no || "sale"})`, debit: overpayment, credit: 0, balance: balAfterCredit, reference_type: "payment", reference_id: sale.id });
        await supabase.from("contacts").update({ current_balance: balAfterCredit }).eq("id", finalCustomerId);
        toast.info(`PKR ${overpayment.toLocaleString()} credited as advance`);
      } else {
        const dueAmount = total - paidAmount;
        const newBal = prevBalance + dueAmount;
        await supabase.from("ledger_entries").insert({ contact_id: finalCustomerId, date: saleDate, description, debit: 0, credit: total, balance: newBal, reference_type: "sale", reference_id: sale.id });
        await supabase.from("contacts").update({ current_balance: newBal }).eq("id", finalCustomerId);
      }
    }
    setInvoiceData({ invoice_no: sale.invoice_no || "N/A", date: saleDate, customer_name: resolveCustomerName(), items: [...cart], subtotal, discount, total, paid_amount: paidAmount, payment_method: payMethodStr, payment_status: finalPaymentStatus, split_payments: splitInfo, overpayment: overpayment > 0 ? overpayment : undefined });
    setInvoiceDialogOpen(true);
    toast.success(`Sale completed! Invoice: ${sale.invoice_no}`);
    logAction("create", "sale", sale.id, `Sale ${sale.invoice_no} - PKR ${total} (${payMethodStr})${overpayment > 0 ? ` | Advance: PKR ${overpayment}` : ""}`);
    setCart([]); setDiscount(0); setNotes(""); setCustomerId(""); setCustomerNameInput(""); setPaymentStatus("paid"); setPaymentAmounts({ cash: 0, bank: 0, jazzcash: 0, easypaisa: 0 }); setSaleDate(new Date().toISOString().split("T")[0]);
    sessionStorage.removeItem(POS_DRAFT_KEY); setProcessing(false);
    const prods = await offlineQuery<Product>("products", { select: "id, name, selling_price, quantity, sku", order: "name" });
    setProducts(prods);
  };

  // ── Print ──
  const handlePrint = () => {
    if (!printRef.current) return;
    const w = window.open("", "_blank");
    if (!w) { toast.error("Allow popups to print"); return; }
    w.document.write(`<html><head><title>Invoice - ${invoiceData?.invoice_no}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;padding:20px;font-size:12px;color:#222}.header{text-align:center;margin-bottom:16px;border-bottom:2px solid #000;padding-bottom:12px}.header h1{font-size:20px;margin-bottom:2px}.header p{font-size:11px;color:#555}.info{display:flex;justify-content:space-between;margin-bottom:12px;font-size:11px}table{width:100%;border-collapse:collapse;margin-bottom:12px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f5f5f5;font-weight:600}.text-right{text-align:right}.totals{margin-left:auto;width:250px}.totals td{border:none;padding:3px 8px}.totals .grand-total td{font-size:16px;font-weight:700;border-top:2px solid #000;padding-top:8px}.footer{text-align:center;margin-top:24px;font-size:10px;color:#888;border-top:1px dashed #ccc;padding-top:8px}.split-info{margin-top:8px;font-size:11px}.credit-info{margin-top:8px;padding:6px 8px;border:2px solid #22c55e;border-radius:4px;font-size:11px;color:#16a34a;font-weight:600}@media print{body{padding:0}}</style></head><body>${printRef.current.innerHTML}<script>window.onload=function(){window.print();window.close();}<\/script></body></html>`);
    w.document.close();
  };

  const formatPhoneForWA = (phone: string | null): string | null => {
    if (!phone) return null;
    let c = phone.replace(/[\s\-()]/g, "");
    if (c.startsWith("0")) c = "92" + c.slice(1);
    if (!c.startsWith("+") && !c.startsWith("92")) c = "92" + c;
    return c.replace(/^\+/, "");
  };

  const handleWhatsApp = () => {
    if (!invoiceData) return;
    const items = invoiceData.items.map((i, idx) => `${idx + 1}. ${i.name} x${i.quantity} = PKR ${i.subtotal.toLocaleString()}`).join("\n");
    let paymentInfo = `Payment: ${invoiceData.payment_method.toUpperCase()} (${invoiceData.payment_status.toUpperCase()})`;
    if (invoiceData.payment_status === "partial") {
      paymentInfo += `\nPaid: PKR ${invoiceData.paid_amount.toLocaleString()}\nRemaining: PKR ${(invoiceData.total - invoiceData.paid_amount).toLocaleString()}`;
    } else if (invoiceData.payment_status === "due") {
      paymentInfo += `\nDue: PKR ${invoiceData.total.toLocaleString()}`;
    }
    if (invoiceData.split_payments && invoiceData.split_payments.length > 0) {
      paymentInfo += `\n*Payment Split:*\n${invoiceData.split_payments.map(sp => `• ${sp.method}: PKR ${sp.amount.toLocaleString()}`).join("\n")}`;
    }
    let creditInfo = "";
    if (invoiceData.overpayment && invoiceData.overpayment > 0) creditInfo = `\n\n💰 *Advance Credit: PKR ${invoiceData.overpayment.toLocaleString()}*`;
    const msg = `*Qazi Enterprises - Invoice*\n\nInvoice: ${invoiceData.invoice_no}\nDate: ${invoiceData.date}\nCustomer: ${invoiceData.customer_name}\n\n*Items:*\n${items}\n\nSubtotal: PKR ${invoiceData.subtotal.toLocaleString()}${invoiceData.discount > 0 ? `\nDiscount: -PKR ${invoiceData.discount.toLocaleString()}` : ""}\n*Total: PKR ${invoiceData.total.toLocaleString()}*\n${paymentInfo}${creditInfo}\n\nThank you for your business!`;
    const ph = customerId ? formatPhoneForWA(customers.find(c => c.id === customerId)?.phone || null) : null;
    window.open(ph ? `https://wa.me/${ph}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const handleBarcodeScan = (code: string) => {
    const p = products.find((p) => p.sku?.toLowerCase() === code.toLowerCase() || p.name.toLowerCase().includes(code.toLowerCase()));
    if (p) { addToCart(p); toast.success(`Added: ${p.name}`); } else { setSearch(code); toast.error(`No product for "${code}"`); }
  };

  // ── Loading ──
  if (loading) return (
    <div className="flex items-center justify-center h-[calc(100vh-6rem)]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-muted border-t-primary" />
        <p className="text-sm text-muted-foreground">Loading POS...</p>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════
  // CART PANEL — reused in desktop sidebar + mobile sheet
  // ═══════════════════════════════════════════════
  const cartPanel = (
    <div className="flex flex-col h-full">
      {/* Cart header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/30">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Cart</span>
          {cart.length > 0 && (
            <Badge variant="secondary" className="h-5 text-[10px] px-1.5 tabular-nums">{cart.length}</Badge>
          )}
        </div>
        {cart.length > 0 && (
          <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive gap-1"
            onClick={() => { setCart([]); toast.info("Cart cleared"); }}>
            <Trash2 className="h-3 w-3" /> Clear
          </Button>
        )}
      </div>

      {/* Cart items - scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-10">
            <ShoppingBag className="h-10 w-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">No items yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Tap a product to add it here</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {cart.map((ci, index) => (
              <div key={`${ci.product_id || ci.name}-${index}`} className="px-3 py-2.5 hover:bg-muted/20 transition-colors">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-sm font-medium truncate">{ci.name}</p>
                      {ci.is_custom && <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-accent/40 text-accent">Custom</Badge>}
                    </div>
                    <button className="p-1 rounded hover:bg-destructive/10 transition-colors shrink-0" onClick={() => removeFromCart(index)}>
                      <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                  {/* Qty × Price = Total — all in one row */}
                  <div className="flex items-center gap-1.5">
                    {/* Qty */}
                    <div className="inline-flex items-center border border-border/60 rounded-md bg-background flex-1 min-w-0">
                      <button className="h-7 w-6 flex items-center justify-center hover:bg-muted transition-colors rounded-l-md shrink-0" onClick={() => updateQty(index, -1)}><Minus className="h-3 w-3" /></button>
                      <NumberInput value={ci.quantity} onValueChange={(v) => updateItemQty(index, v)} className="w-full h-7 text-xs text-center border-0 border-x border-border/60 rounded-none bg-transparent [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [appearance:textfield]" min={0.01} step={0.01} />
                      <button className="h-7 w-6 flex items-center justify-center hover:bg-muted transition-colors rounded-r-md shrink-0" onClick={() => updateQty(index, 1)}><Plus className="h-3 w-3" /></button>
                    </div>
                    <span className="text-muted-foreground text-xs shrink-0">×</span>
                    {/* Unit Price */}
                    <div className="inline-flex items-center border border-border/60 rounded-md bg-background flex-1 min-w-0">
                      <span className="h-7 px-1 flex items-center text-[10px] text-muted-foreground border-r border-border/60 shrink-0">₨</span>
                      <NumberInput value={ci.unit_price} onValueChange={(v) => updateUnitPrice(index, v)} className="w-full h-7 text-xs text-center border-0 rounded-none bg-transparent [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [appearance:textfield]" min={0} />
                    </div>
                    <span className="text-muted-foreground text-xs shrink-0">=</span>
                    {/* Total (editable → auto-calcs unit price) */}
                    <div className="inline-flex items-center border border-border/60 rounded-md bg-background flex-1 min-w-0">
                      <span className="h-7 px-1 flex items-center text-[10px] text-muted-foreground border-r border-border/60 shrink-0">₨</span>
                      <NumberInput value={ci.subtotal} onValueChange={(v) => setCombinedPrice(index, v)} className="w-full h-7 text-xs text-center border-0 rounded-none bg-transparent [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [appearance:textfield]" min={0} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Checkout section */}
      <div className="shrink-0 border-t border-border/50 bg-muted/20 p-3 space-y-2.5">
        {/* Customer */}
        <div>
          <Label className="text-[10px] mb-1 block font-semibold text-muted-foreground uppercase tracking-widest">Customer</Label>
          <div className="flex gap-1.5">
            <div className="flex-1">
              <CustomerAutocomplete customers={customers} value={customerNameInput}
                onValueChange={(v) => { setCustomerNameInput(v); setCustomerId(""); }}
                onCustomerSelect={(c) => { if (c) { setCustomerId(c.id); setCustomerNameInput(c.name); } }}
                placeholder="Search customer..." />
            </div>
            <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={() => setShowNewCustomer(!showNewCustomer)}>
              <UserPlus className="h-3.5 w-3.5" />
            </Button>
          </div>
          {customerId && (
            <Badge variant="secondary" className="text-[10px] h-4 mt-1 gap-1 bg-success/10 text-success border-success/20">
              ✓ {customers.find(c => c.id === customerId)?.name}
            </Badge>
          )}
        </div>

        {/* Quick Add Customer */}
        <AnimatePresence>
          {showNewCustomer && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="rounded-lg border p-2.5 space-y-1.5 bg-card">
                <Input placeholder="Name *" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} className="h-8 text-xs" />
                <Input placeholder="Phone" value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} className="h-8 text-xs" />
                <div className="flex gap-1.5">
                  <Button size="sm" className="flex-1 h-7 text-xs" onClick={addNewCustomer}>Save</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowNewCustomer(false)}>Cancel</Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sale Date */}
        <div className="flex items-center gap-2">
          <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
          <Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} max={new Date().toISOString().split("T")[0]} className="h-8 text-xs flex-1" />
        </div>
        {saleDate !== new Date().toISOString().split("T")[0] && (
          <p className="text-[10px] text-warning font-medium">⚠ Backdated sale</p>
        )}

        {/* Totals */}
        <div className="rounded-lg bg-card border p-2.5 space-y-1">
          <div className="flex justify-between text-xs"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">₨{subtotal.toLocaleString()}</span></div>
          <div className="flex justify-between items-center gap-2 text-xs">
            <span className="text-muted-foreground">Discount</span>
            <NumberInput value={discount} onValueChange={setDiscount} className="h-7 w-24 text-xs text-right" min={0} />
          </div>
          <Separator className="my-1.5" />
          <div className="flex justify-between items-center">
            <span className="text-sm font-bold">Total</span>
            <span className="text-lg font-bold text-primary tabular-nums">₨{total.toLocaleString()}</span>
          </div>
        </div>

        {/* Payment Status Buttons */}
        <div className="flex gap-1.5">
          {[
            { value: "paid", label: "✓ Paid", activeClass: "bg-primary text-primary-foreground" },
            { value: "partial", label: "◐ Split", activeClass: "bg-accent text-accent-foreground" },
            { value: "due", label: "⏳ Due", activeClass: "bg-destructive text-destructive-foreground" },
          ].map(({ value, label, activeClass }) => (
            <Button
              key={value}
              size="sm"
              variant={paymentStatus === value ? "default" : "outline"}
              className={`flex-1 h-8 text-xs font-semibold ${paymentStatus === value ? activeClass : ""}`}
              onClick={() => setPaymentStatus(value)}
            >
              {label}
            </Button>
          ))}
        </div>

        <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="h-8 text-xs" />

        {/* Payment Breakdown */}
        {paymentStatus !== "due" && (
          <div>
            <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-full py-1 transition-colors"
              onClick={() => setShowBreakdown(!showBreakdown)}>
              <Wallet className="h-3 w-3" /> {showBreakdown ? "Hide" : "Split"} Payment
              {showBreakdown ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
            </button>
            <AnimatePresence>
              {showBreakdown && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="rounded-lg border bg-card p-2 space-y-1 mt-1">
                    {[{ key: "cash", label: "Cash", icon: "💵" }, { key: "jazzcash", label: "JazzCash", icon: "📱" }, { key: "easypaisa", label: "EasyPaisa", icon: "📲" }, { key: "bank", label: "Bank", icon: "🏦" }].map(({ key, label, icon }) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-xs w-4">{icon}</span>
                        <span className="text-[10px] w-14 text-muted-foreground">{label}</span>
                        <NumberInput value={paymentAmounts[key]} onValueChange={(v) => updatePaymentAmount(key, v)} className="h-6 text-xs flex-1" min={0} />
                      </div>
                    ))}
                    <div className="text-[10px] pt-1 border-t flex justify-between text-muted-foreground">
                      <span>Paid: ₨{paidTotal.toLocaleString()}</span>
                      {paidRemaining > 0 && paidTotal > 0 && <span className="text-destructive font-medium">Due: ₨{paidRemaining.toLocaleString()}</span>}
                      {paidTotal >= total && total > 0 && paidTotal === total && <span className="text-success font-medium">✓ Full</span>}
                    </div>
                    {overpayment > 0 && (
                      <div className="text-[10px] flex justify-between text-success font-medium bg-success/10 rounded px-2 py-0.5">
                        <span>💰 Advance:</span><span>₨{overpayment.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Checkout Button */}
        <Button className="w-full h-11 text-sm font-semibold gap-2 rounded-lg" size="lg" onClick={handleCheckout} disabled={cart.length === 0 || processing}>
          {processing ? (
            <><div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" /> Processing...</>
          ) : (
            <><CreditCard className="h-4 w-4" /> Complete Sale · ₨{total.toLocaleString()}</>
          )}
        </Button>
      </div>
    </div>
  );

  // ═══════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════
  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] overflow-hidden">

      {/* ── Top Toolbar ── */}
      <div className="shrink-0 flex items-center gap-2 mb-3">
        {/* Search */}
        <div className="relative flex-1">
          <ProductAutocomplete products={products} value={search} onValueChange={setSearch} onProductSelect={addToCart}
            placeholder="Search products..."
            className="pl-9 h-10 rounded-lg bg-card border-border/60" />
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full bg-muted hover:bg-muted-foreground/20">
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => setScannerOpen(true)} title="Barcode Scanner">
          <ScanLine className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => setShowCustomEntry(!showCustomEntry)} title="Custom Item">
          <Plus className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => setCalcOpen(!calcOpen)} title="Calculator">
          <Calculator className="h-4 w-4" />
        </Button>
      </div>

      {/* ── Calculator ── */}
      <AnimatePresence>
        {calcOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden shrink-0 mb-2">
            <div className="rounded-lg border bg-card p-3 max-w-[240px] ml-auto">
              <div className="bg-muted rounded px-3 py-2 text-right text-lg font-mono font-bold mb-2 min-h-[36px]">{calcDisplay}</div>
              <div className="grid grid-cols-4 gap-1">
                {["C", "÷", "×", "-", "7", "8", "9", "+", "4", "5", "6", "=", "1", "2", "3", ".", "0"].map((key) => (
                  <Button key={key} size="sm" variant={["C", "÷", "×", "-", "+", "="].includes(key) ? "secondary" : "outline"}
                    className={`h-8 text-xs font-semibold ${key === "=" ? "row-span-2" : ""} ${key === "0" ? "col-span-2" : ""}`}
                    onClick={() => calcPress(key)}>{key}</Button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Custom Item ── */}
      <AnimatePresence>
        {showCustomEntry && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden shrink-0 mb-2">
            <div className="flex gap-2 items-end p-2.5 rounded-lg border bg-card">
              <div className="flex-1 space-y-1">
                <Label className="text-[10px]">Name</Label>
                <Input placeholder="Product name" value={customProductName} onChange={(e) => setCustomProductName(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="w-16 space-y-1">
                <Label className="text-[10px]">Qty</Label>
                <NumberInput value={customProductQty} onValueChange={setCustomProductQty} min={1} className="h-8 text-xs" />
              </div>
              <div className="w-24 space-y-1">
                <Label className="text-[10px]">Price</Label>
                <NumberInput value={customProductPrice} onValueChange={setCustomProductPrice} className="h-8 text-xs" />
              </div>
              <Button size="sm" className="h-8" onClick={addCustomProduct}>Add</Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setShowCustomEntry(false)}><X className="h-3.5 w-3.5" /></Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Split Layout ── */}
      <div className="flex-1 flex gap-3 min-h-0 overflow-hidden">

        {/* LEFT: Products */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Pinned strip */}
          {pinnedIds.size > 0 && !search && (
            <div className="shrink-0 flex gap-1.5 overflow-x-auto pb-2 mb-2 scrollbar-thin">
              {products.filter(p => pinnedIds.has(p.id)).map(p => {
                const inCart = cart.find(c => c.product_id === p.id && !c.is_custom);
                return (
                  <button key={p.id} onClick={() => addToCart(p)}
                    className={`relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs whitespace-nowrap shrink-0 transition-all
                      ${inCart ? "bg-primary/10 border-primary/30 font-semibold" : "bg-card border-border/50 hover:border-primary/30"}`}>
                    <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                    <span className="truncate max-w-[80px]">{p.name}</span>
                    <span className="font-semibold text-primary">₨{Number(p.selling_price).toLocaleString()}</span>
                    {inCart && <Badge className="h-4 px-1 text-[9px] bg-primary text-primary-foreground">{inCart.quantity}</Badge>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Product list */}
          <div className="flex-1 overflow-y-auto rounded-lg border bg-card">
            {sortedProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                <Package className="h-10 w-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">{search ? "No products match" : "No products available"}</p>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {sortedProducts.map((p) => {
                  const inCart = cart.find(c => c.product_id === p.id && !c.is_custom);
                  const isPinned = pinnedIds.has(p.id);
                  const outOfStock = p.quantity <= 0;
                  const lowStock = p.quantity > 0 && p.quantity <= 5;

                  return (
                    <div key={p.id}
                      className={`flex items-center gap-3 px-3 py-2.5 transition-colors cursor-pointer select-none
                        ${outOfStock ? "opacity-35 pointer-events-none" : "hover:bg-muted/30 active:bg-muted/50"}
                        ${inCart ? "bg-primary/[0.04]" : ""}`}
                      onClick={() => !outOfStock && addToCart(p)}>

                      {/* Icon */}
                      <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 transition-colors
                        ${inCart ? "bg-primary/10" : "bg-muted/50"}`}>
                        {inCart ? (
                          <span className="text-xs font-bold text-primary tabular-nums">{inCart.quantity}</span>
                        ) : (
                          <Package className="h-4 w-4 text-muted-foreground/50" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {isPinned && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 shrink-0" />}
                          <p className="text-sm font-medium truncate">{p.name}</p>
                        </div>
                        {p.sku && <p className="text-[10px] text-muted-foreground font-mono mt-0.5"><Hash className="h-2.5 w-2.5 inline" />{p.sku}</p>}
                      </div>

                      {/* Stock badge */}
                      <span className={`text-[10px] tabular-nums shrink-0 px-1.5 py-0.5 rounded
                        ${outOfStock ? "bg-destructive/10 text-destructive" : lowStock ? "bg-warning/10 text-warning" : "text-muted-foreground"}`}>
                        {outOfStock ? "Out" : `${p.quantity} in stock`}
                      </span>

                      {/* Price */}
                      <span className="text-sm font-semibold text-primary tabular-nums shrink-0">
                        ₨{Number(p.selling_price).toLocaleString()}
                      </span>

                      {/* Pin toggle */}
                      <button className={`p-1 rounded transition-all shrink-0 ${isPinned ? "text-yellow-500" : "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-yellow-500"}`}
                        onClick={(e) => { e.stopPropagation(); togglePin(p.id); }} title={isPinned ? "Unpin" : "Pin"}>
                        <Star className={`h-3 w-3 ${isPinned ? "fill-current" : ""}`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Cart sidebar — visible on lg+ */}
        <div className="hidden lg:flex w-[380px] xl:w-[420px] shrink-0 rounded-lg border bg-card overflow-hidden">
          <div className="flex-1 min-h-0">
            {cartPanel}
          </div>
        </div>
      </div>

      {/* ── Mobile: Sticky Bottom Cart Bar ── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50">
        <button onClick={() => setMobileCartOpen(!mobileCartOpen)}
          className="w-full flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground text-sm font-medium shadow-[0_-2px_12px_rgba(0,0,0,0.12)]"
          style={{ borderRadius: mobileCartOpen ? 0 : "12px 12px 0 0" }}>
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" />
            <span>Cart ({cart.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold tabular-nums">₨{total.toLocaleString()}</span>
            {mobileCartOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </div>
        </button>
        <AnimatePresence>
          {mobileCartOpen && (
            <motion.div initial={{ height: 0 }} animate={{ height: "70vh" }} exit={{ height: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 350 }}
              className="bg-background border-t border-border/40 overflow-hidden">
              <div style={{ height: "70vh" }}>
                {cartPanel}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Add bottom padding on mobile for the sticky bar */}
      <div className="lg:hidden h-14 shrink-0" />

      {/* ═══ Invoice Dialog ═══ */}
      <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2"><Receipt className="h-5 w-5 text-primary" /> Invoice</div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={handleWhatsApp}><MessageCircle className="h-4 w-4" /> WhatsApp</Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={handlePrint}><Printer className="h-4 w-4" /> Print</Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          {invoiceData && (
            <div ref={printRef}>
              <div style={{ textAlign: "center", marginBottom: 16, borderBottom: "2px solid #000", paddingBottom: 12 }}>
                <h1 style={{ fontSize: 20 }}>Qazi Enterprises</h1>
                <p style={{ fontSize: 11, color: "#555" }}>Your trusted business partner</p>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, fontSize: 12 }}>
                <div><p><strong>Invoice:</strong> {invoiceData.invoice_no}</p><p><strong>Customer:</strong> {invoiceData.customer_name}</p></div>
                <div style={{ textAlign: "right" }}><p><strong>Date:</strong> {invoiceData.date}</p><p><strong>Status:</strong> {invoiceData.payment_status.toUpperCase()}</p></div>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12, fontSize: 12 }}>
                <thead><tr style={{ borderBottom: "2px solid #000" }}><th style={{ textAlign: "left", padding: "6px 4px" }}>#</th><th style={{ textAlign: "left", padding: "6px 4px" }}>Product</th><th style={{ textAlign: "right", padding: "6px 4px" }}>Qty</th><th style={{ textAlign: "right", padding: "6px 4px" }}>Price</th><th style={{ textAlign: "right", padding: "6px 4px" }}>Total</th></tr></thead>
                <tbody>
                  {invoiceData.items.map((ci, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #ddd" }}><td style={{ padding: "6px 4px" }}>{i + 1}</td><td style={{ padding: "6px 4px" }}>{ci.name}</td><td style={{ textAlign: "right", padding: "6px 4px" }}>{ci.quantity}</td><td style={{ textAlign: "right", padding: "6px 4px" }}>PKR {ci.unit_price.toLocaleString()}</td><td style={{ textAlign: "right", padding: "6px 4px" }}>PKR {ci.subtotal.toLocaleString()}</td></tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginLeft: "auto", width: 220, fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}><span>Subtotal:</span><span>PKR {invoiceData.subtotal.toLocaleString()}</span></div>
                {invoiceData.discount > 0 && <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "red" }}><span>Discount:</span><span>-PKR {invoiceData.discount.toLocaleString()}</span></div>}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 0", borderTop: "2px solid #000", fontWeight: 700, fontSize: 16 }}><span>Total:</span><span>PKR {invoiceData.total.toLocaleString()}</span></div>
                {(invoiceData.payment_status === "partial" || invoiceData.payment_status === "due") && (
                  <div style={{ marginTop: 8, padding: "6px 0", borderTop: "1px dashed #ccc", fontSize: 12 }}>
                    {invoiceData.paid_amount > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", color: "#16a34a" }}>
                        <span>Paid:</span><span>PKR {invoiceData.paid_amount.toLocaleString()}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", color: "#dc2626", fontWeight: 600 }}>
                      <span>Remaining:</span><span>PKR {(invoiceData.total - invoiceData.paid_amount).toLocaleString()}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0 0", fontWeight: 700, fontSize: 11, borderTop: "1px solid #eee", marginTop: 4 }}>
                      <span>Status:</span><span style={{ textTransform: "uppercase" }}>{invoiceData.payment_status}</span>
                    </div>
                  </div>
                )}
              </div>
              {invoiceData.split_payments && invoiceData.split_payments.length > 0 && (
                <div style={{ marginTop: 12, padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 11 }}>
                  <p style={{ fontWeight: 600, marginBottom: 4 }}>Payment Breakdown:</p>
                  {invoiceData.split_payments.map((sp, i) => <p key={i}>• {sp.method.charAt(0).toUpperCase() + sp.method.slice(1)}: PKR {sp.amount.toLocaleString()}</p>)}
                  {(() => { const rem = invoiceData.total - invoiceData.split_payments!.reduce((s, sp) => s + sp.amount, 0); return rem > 0 ? <p style={{ color: "red", fontWeight: 600 }}>• Due: PKR {rem.toLocaleString()}</p> : null; })()}
                </div>
              )}
              {invoiceData.overpayment && invoiceData.overpayment > 0 && (
                <div style={{ marginTop: 8, padding: "6px 8px", border: "2px solid #22c55e", borderRadius: 4, fontSize: 11, color: "#16a34a", fontWeight: 600 }}>
                  💰 Advance Credit: PKR {invoiceData.overpayment.toLocaleString()} (saved for future)
                </div>
              )}
              <div style={{ textAlign: "center", marginTop: 24, fontSize: 10, color: "#888", borderTop: "1px dashed #ccc", paddingTop: 8 }}>
                <p>Thank you for your business!</p><p>Qazi Enterprises — All rights reserved</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <BarcodeScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onScan={handleBarcodeScan} />
    </div>
  );
}
