import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Product {
  id: string;
  name: string;
  selling_price: number;
  quantity: number;
  sku: string | null;
}

interface ProductAutocompleteProps {
  products: Product[];
  value: string;
  onValueChange: (value: string) => void;
  onProductSelect: (product: Product) => void;
  placeholder?: string;
  className?: string;
}

export default function ProductAutocomplete({
  products,
  value,
  onValueChange,
  onProductSelect,
  placeholder = "Type product name or SKU...",
  className,
}: ProductAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [filtered, setFiltered] = useState<Product[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value.trim().length === 0) {
      setFiltered([]);
      setOpen(false);
      setHighlightIndex(-1);
      return;
    }
    const query = value.toLowerCase();
    const matches = products.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        (p.sku && p.sku.toLowerCase().includes(query))
    ).slice(0, 10);
    setFiltered(matches);
    setOpen(matches.length > 0);
    setHighlightIndex(-1);
  }, [value, products]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll("[data-item]");
      items[highlightIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || filtered.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < filtered.length) {
        onProductSelect(filtered[highlightIndex]);
        onValueChange("");
        setOpen(false);
        setHighlightIndex(-1);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlightIndex(-1);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onFocus={() => {
          if (filtered.length > 0) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn(className)}
      />
      {open && (
        <div ref={listRef} className="absolute z-50 top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-md border bg-popover shadow-lg">
          {filtered.map((p, i) => (
            <button
              key={p.id}
              type="button"
              data-item
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 text-sm transition-colors text-left",
                i === highlightIndex ? "bg-accent" : "hover:bg-accent"
              )}
              onClick={() => {
                onProductSelect(p);
                onValueChange("");
                setOpen(false);
                setHighlightIndex(-1);
              }}
            >
              <div className="flex-1 min-w-0">
                <span className="font-medium truncate block">{p.name}</span>
                {p.sku && <span className="text-xs text-muted-foreground">{p.sku}</span>}
              </div>
              <div className="flex items-center gap-2 ml-2 shrink-0">
                <span className="text-sm font-bold">Rs {Number(p.selling_price).toLocaleString()}</span>
                <Badge variant={p.quantity <= 0 ? "destructive" : "secondary"} className="text-[10px]">
                  {p.quantity}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
