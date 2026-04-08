import { useState } from "react";
import { RotateCcw, Package, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/customClient";
import { toast } from "sonner";
import { NumberInput } from "@/components/NumberInput";

interface SaleItem {
  id: string;
  product_id: string | null;
  product_name: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

interface ReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string;
  invoiceNo: string | null;
  saleItems: SaleItem[];
  onReturnComplete: () => void;
}

interface ReturnItem {
  sale_item_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  max_quantity: number;
  unit_price: number;
  selected: boolean;
}

export default function ReturnDialog({ open, onOpenChange, saleId, invoiceNo, saleItems, onReturnComplete }: ReturnDialogProps) {
  const [returnItems, setReturnItems] = useState<ReturnItem[]>(
    saleItems.map((item) => ({
      sale_item_id: item.id,
      product_id: item.product_id,
      product_name: item.product_name || "Unknown Product",
      quantity: item.quantity,
      max_quantity: item.quantity,
      unit_price: item.unit_price,
      selected: false,
    }))
  );
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [loading, setLoading] = useState(false);

  const selectedItems = returnItems.filter((i) => i.selected && i.quantity > 0);
  const totalRefund = selectedItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  const toggleItem = (idx: number) => {
    setReturnItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, selected: !item.selected } : item))
    );
  };

  const updateQty = (idx: number, qty: number) => {
    setReturnItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, quantity: Math.min(qty, item.max_quantity) } : item))
    );
  };

  const handleReturn = async () => {
    if (selectedItems.length === 0) {
      toast.error("Select at least one item to return");
      return;
    }
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();

      // 1. Create return record
      const { data: returnData, error: returnError } = await supabase
        .from("returns")
        .insert({
          sale_id: saleId,
          total_refund: totalRefund,
          refund_method: refundMethod,
          reason: reason || null,
          created_by: userData.user?.id || null,
        })
        .select("id")
        .single();

      if (returnError) throw returnError;

      // 2. Create return items
      const returnItemsPayload = selectedItems.map((item) => ({
        return_id: returnData.id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        subtotal: item.quantity * item.unit_price,
      }));

      const { error: itemsError } = await supabase.from("return_items").insert(returnItemsPayload);
      if (itemsError) throw itemsError;

      // 3. Update product inventory (add back stock)
      for (const item of selectedItems) {
        if (item.product_id) {
          const { data: product } = await supabase
            .from("products")
            .select("quantity")
            .eq("id", item.product_id)
            .single();

          if (product) {
            await supabase
              .from("products")
              .update({ quantity: (product.quantity || 0) + item.quantity })
              .eq("id", item.product_id);
          }
        }
      }

      // 4. Update sale transaction (reduce paid_amount or adjust total)
      const { data: sale } = await supabase
        .from("sale_transactions")
        .select("total, paid_amount")
        .eq("id", saleId)
        .single();

      if (sale) {
        const newTotal = Number(sale.total || 0) - totalRefund;
        const newPaid = Math.max(0, Number(sale.paid_amount || 0) - totalRefund);
        await supabase
          .from("sale_transactions")
          .update({
            total: newTotal,
            paid_amount: newPaid,
            notes: `Return processed: PKR ${totalRefund.toLocaleString()} refunded via ${refundMethod}`,
          })
          .eq("id", saleId);
      }

      toast.success(`Return processed! PKR ${totalRefund.toLocaleString()} refunded`);
      onReturnComplete();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Return error:", err);
      toast.error(err.message || "Failed to process return");
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-destructive" />
            Return / Refund — {invoiceNo || "Invoice"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Item Selection */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Select items to return</Label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {returnItems.map((item, idx) => (
                <div
                  key={item.sale_item_id}
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    item.selected ? "border-destructive bg-destructive/5" : "hover:bg-muted/50"
                  }`}
                  onClick={() => toggleItem(idx)}
                >
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={() => toggleItem(idx)}
                    className="rounded"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      PKR {item.unit_price.toLocaleString()} × {item.max_quantity}
                    </p>
                  </div>
                  {item.selected && (
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Label className="text-xs">Qty:</Label>
                      <NumberInput
                        value={item.quantity}
                        onValueChange={(v) => updateQty(idx, v)}
                        min={1}
                        max={item.max_quantity}
                        className="w-20 h-8 text-sm"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <Label className="text-xs">Reason for return</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Damaged, wrong item, customer request..."
              rows={2}
            />
          </div>

          {/* Refund Method */}
          <div className="space-y-1.5">
            <Label className="text-xs">Refund Method</Label>
            <Select value={refundMethod} onValueChange={setRefundMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank">Bank Transfer</SelectItem>
                <SelectItem value="jazzcash">JazzCash</SelectItem>
                <SelectItem value="easypaisa">EasyPaisa</SelectItem>
                <SelectItem value="credit">Store Credit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Summary */}
          {selectedItems.length > 0 && (
            <div className="rounded-lg bg-destructive/10 p-4 space-y-1">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-sm font-medium">Return Summary</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedItems.length} item(s) • Stock will be restored
              </p>
              <p className="text-lg font-bold text-destructive">
                Refund: PKR {totalRefund.toLocaleString()}
              </p>
            </div>
          )}

          <Button
            onClick={handleReturn}
            disabled={loading || selectedItems.length === 0}
            className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            {loading ? "Processing..." : `Process Return (PKR ${totalRefund.toLocaleString()})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
