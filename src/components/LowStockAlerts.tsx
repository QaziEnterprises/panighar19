import { useState, useEffect } from "react";
import { Bell, Package, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/customClient";
import { useNavigate } from "react-router-dom";

interface LowStockProduct {
  id: string;
  name: string;
  quantity: number;
  alert_threshold: number;
  purchase_price: number;
}

export default function LowStockAlerts() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<LowStockProduct[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, quantity, alert_threshold, purchase_price");
      const low = (data || [])
        .filter((p: any) => p.alert_threshold && p.alert_threshold > 0 && (p.quantity || 0) <= p.alert_threshold)
        .map((p: any) => ({
          id: p.id,
          name: p.name,
          quantity: p.quantity || 0,
          alert_threshold: p.alert_threshold || 0,
          purchase_price: p.purchase_price || 0,
        }));
      setProducts(low);
    };
    fetch();
    const interval = setInterval(fetch, 60000);
    return () => clearInterval(interval);
  }, []);

  const count = products.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="border-b px-4 py-3">
          <h4 className="font-semibold text-sm">Low Stock Alerts</h4>
          <p className="text-xs text-muted-foreground">{count} product(s) need restocking</p>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {products.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
              All stock levels are healthy!
            </div>
          ) : (
            products.map((p) => {
              const reorderQty = Math.max(p.alert_threshold * 2 - p.quantity, p.alert_threshold);
              return (
                <div key={p.id} className="flex items-center gap-3 border-b last:border-0 px-4 py-2.5 hover:bg-muted/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Stock: <span className="text-destructive font-medium">{p.quantity}</span> / Min: {p.alert_threshold}
                    </p>
                    <Badge variant="outline" className="text-[10px] mt-1">
                      Reorder: {reorderQty} units
                    </Badge>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs shrink-0"
                    onClick={() => {
                      setOpen(false);
                      navigate(`/purchases?reorder=${p.id}&product=${encodeURIComponent(p.name)}&qty=${reorderQty}&price=${p.purchase_price}`);
                    }}
                  >
                    <ShoppingCart className="h-3 w-3 mr-1" /> Order
                  </Button>
                </div>
              );
            })
          )}
        </div>
        {count > 0 && (
          <div className="border-t p-2">
            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { setOpen(false); navigate("/products-db"); }}>
              View All Products
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
