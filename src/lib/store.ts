import { InventoryItem, Receivable, SaleEntry } from "@/types";
import { parseReceivablesFromBuffer, parseSalesFromBuffer } from "@/lib/excel";
import { supabase } from "@/integrations/supabase/customClient";

const KEYS = {
  inventory: "shop_inventory",
  receivables: "shop_receivables",
  sales: "shop_sales",
  initialized: "shop_data_initialized",
};

function get<T>(key: string): T[] {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function set<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data));
}

const PRODUCT_CATEGORIES = [
  "Water Filtration Plants",
  "RO Membranes",
  "Water Filters & Cartridges",
  "Water Bottles",
  "Pumps & Motors",
  "Pipes & Fittings",
  "UV Systems",
  "Water Coolers & Dispensers",
  "Accessories & Parts",
  "Chemicals & Media",
  "Installation Materials",
  "General",
];

const EXPENSE_CATEGORIES = [
  "Rent",
  "Utilities (Electricity/Gas/Water)",
  "Salaries & Wages",
  "Transport & Delivery",
  "Maintenance & Repairs",
  "Plant Equipment",
  "Raw Materials & Chemicals",
  "Packaging Materials",
  "Marketing & Advertising",
  "Office Supplies",
  "Phone & Internet",
  "Vehicle Fuel",
  "Insurance",
  "Miscellaneous",
];

async function seedCategories() {
  const seeded = localStorage.getItem("categories_seeded_v1");
  if (seeded) return;

  try {
    // Seed product categories
    const { data: existingProdCats } = await supabase.from("product_categories").select("name");
    const existingProdNames = new Set((existingProdCats || []).map((c: any) => c.name.toLowerCase()));
    const newProdCats = PRODUCT_CATEGORIES.filter(n => !existingProdNames.has(n.toLowerCase())).map(name => ({ name }));
    if (newProdCats.length > 0) {
      await supabase.from("product_categories").insert(newProdCats);
    }

    // Seed expense categories
    const { data: existingExpCats } = await supabase.from("expense_categories").select("name");
    const existingExpNames = new Set((existingExpCats || []).map((c: any) => c.name.toLowerCase()));
    const newExpCats = EXPENSE_CATEGORIES.filter(n => !existingExpNames.has(n.toLowerCase())).map(name => ({ name }));
    if (newExpCats.length > 0) {
      await supabase.from("expense_categories").insert(newExpCats);
    }

    localStorage.setItem("categories_seeded_v1", "true");
  } catch (e) {
    console.warn("Category seeding failed (tables may not exist yet):", e);
  }
}

// Clear old bundled data - user will upload fresh data
export async function initializeDefaultData() {
  // Clear previous ledger data as requested
  const cleared = localStorage.getItem("ledger_cleared_v2");
  if (!cleared) {
    localStorage.removeItem(KEYS.receivables);
    localStorage.removeItem(KEYS.sales);
    localStorage.setItem("ledger_cleared_v2", "true");
  }

  // Seed water filtration & expense categories
  await seedCategories();
}

// Inventory
export function getInventory(): InventoryItem[] {
  return get<InventoryItem>(KEYS.inventory);
}

export function saveInventory(items: InventoryItem[]) {
  set(KEYS.inventory, items);
}

export function addInventoryItem(item: Omit<InventoryItem, "id" | "createdAt">): InventoryItem {
  const items = getInventory();
  const newItem: InventoryItem = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  items.push(newItem);
  saveInventory(items);
  return newItem;
}

export function updateInventoryItem(id: string, updates: Partial<InventoryItem>) {
  const items = getInventory().map((item) =>
    item.id === id ? { ...item, ...updates } : item
  );
  saveInventory(items);
}

export function deleteInventoryItem(id: string) {
  saveInventory(getInventory().filter((item) => item.id !== id));
}

// Receivables
export function getReceivables(): Receivable[] {
  return get<Receivable>(KEYS.receivables);
}

export function saveReceivables(items: Receivable[]) {
  set(KEYS.receivables, items);
}

// Sales
export function getSales(): SaleEntry[] {
  return get<SaleEntry>(KEYS.sales);
}

export function saveSales(items: SaleEntry[]) {
  set(KEYS.sales, items);
}
