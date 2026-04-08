import { useState, useEffect } from "react";
import { Printer, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/customClient";

interface Product {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  selling_price: number;
  category_id: string | null;
}

interface Category {
  id: string;
  name: string;
}

export default function PriceListPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const [{ data: prods }, { data: cats }] = await Promise.all([
        supabase.from("products").select("id, name, sku, unit, selling_price, category_id").order("name"),
        supabase.from("product_categories").select("id, name").order("name"),
      ]);
      setProducts(prods || []);
      setCategories(cats || []);
      setLoading(false);
    };
    fetch();
  }, []);

  const filtered = selectedCategory === "all"
    ? products
    : products.filter((p) => p.category_id === selectedCategory);

  const grouped = categories
    .map((cat) => ({
      ...cat,
      items: filtered.filter((p) => p.category_id === cat.id),
    }))
    .filter((g) => g.items.length > 0);

  const uncategorized = filtered.filter((p) => !p.category_id);

  const handlePrint = () => {
    const rows = filtered.map((p, i) => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${i + 1}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-weight:500">${p.name}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;color:#666">${p.sku || "—"}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${p.unit || "—"}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:600">Rs ${Number(p.selling_price || 0).toLocaleString()}</td>
      </tr>
    `).join("");

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Price List - Qazi Enterprises</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; padding: 24px; color: #222; }
        h1 { font-size: 22px; margin-bottom: 4px; }
        .sub { font-size: 12px; color: #666; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; padding: 8px; border-bottom: 2px solid #000; font-size: 12px; text-transform: uppercase; color: #555; }
        th:last-child { text-align: right; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <h1>Qazi Enterprises — Price List</h1>
      <p class="sub">Updated: ${new Date().toLocaleDateString()} • ${filtered.length} products</p>
      <table>
        <thead><tr><th>#</th><th>Product</th><th>SKU</th><th>Unit</th><th>Price</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <script>window.onload=()=>{window.print();window.close();}</script>
      </body></html>`);
    w.document.close();
  };

  if (loading) return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Price List</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} products • Last updated: {new Date().toLocaleDateString()}</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-44">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handlePrint} className="gap-2" disabled={filtered.length === 0}>
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      {grouped.map((group) => (
        <div key={group.id} className="mb-6">
          <h2 className="text-base font-semibold mb-2 flex items-center gap-2">
            {group.name}
            <Badge variant="secondary" className="text-xs">{group.items.length}</Badge>
          </h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-12">#</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Product</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">SKU</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Unit</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Price</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((p, i) => (
                  <tr key={p.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium">{p.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{p.sku || "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{p.unit || "—"}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">Rs {Number(p.selling_price || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {uncategorized.length > 0 && (
        <div className="mb-6">
          <h2 className="text-base font-semibold mb-2">Uncategorized <Badge variant="secondary" className="text-xs">{uncategorized.length}</Badge></h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-12">#</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Product</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">SKU</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Unit</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Price</th>
                </tr>
              </thead>
              <tbody>
                {uncategorized.map((p, i) => (
                  <tr key={p.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium">{p.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{p.sku || "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{p.unit || "—"}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">Rs {Number(p.selling_price || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No products found. Add products first.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
