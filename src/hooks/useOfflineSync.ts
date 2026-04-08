import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/customClient";
import { toast } from "sonner";

// ── Cache Keys ──
const OFFLINE_QUEUE_KEY = "offline_mutation_queue";
const CACHE_PREFIX = "offline_cache_";
const CACHE_TABLES = [
  { table: "products", select: "id, name, selling_price, purchase_price, quantity, sku, brand, unit, category_id, alert_threshold", order: "name" },
  { table: "contacts", select: "id, name, phone, email, city, address, type, current_balance, opening_balance, notes", order: "name" },
  { table: "sale_transactions", select: "*", order: "created_at", ascending: false },
  { table: "sale_items", select: "*", order: undefined },
  { table: "expenses", select: "*", order: "date", ascending: false },
  { table: "expense_categories", select: "*", order: "name" },
  { table: "purchases", select: "*", order: "date", ascending: false },
  { table: "purchase_items", select: "*", order: undefined },
  { table: "ledger_entries", select: "*", order: "date", ascending: false },
  { table: "daily_summaries", select: "*", order: "date", ascending: false },
  { table: "product_categories", select: "*", order: "name" },
  { table: "cash_register", select: "*", order: "date", ascending: false },
];

// ── Types ──
interface QueuedMutation {
  id: string;
  timestamp: number;
  table: string;
  operation: "insert" | "update" | "delete" | "upsert";
  payload?: any;
  match?: Record<string, any>;
  description: string;
  relatedInserts?: { table: string; items: any[]; foreignKey?: string }[];
  stockUpdates?: { productId: string; quantityChange: number }[];
}

export interface OfflineSyncState {
  isOnline: boolean;
  queueLength: number;
  syncing: boolean;
  lastSyncedAt: string | null;
  addToQueue: (mutation: Omit<QueuedMutation, "id" | "timestamp">) => void;
  syncQueue: () => Promise<void>;
  getCachedData: <T = any>(table: string) => T[];
  cacheAllData: () => Promise<void>;
  offlineMutation: (opts: OfflineMutationOpts) => Promise<any>;
}

interface OfflineMutationOpts {
  table: string;
  operation: "insert" | "update" | "delete" | "upsert";
  payload?: any;
  match?: Record<string, any>;
  description: string;
  relatedInserts?: { table: string; items: any[]; foreignKey?: string }[];
  stockUpdates?: { productId: string; quantityChange: number }[];
  onSuccess?: (data: any) => void;
  onError?: (err: any) => void;
  select?: boolean;
}

function safeGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function safeSet(key: string, value: any) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Clear old caches if storage is full
    for (const ct of CACHE_TABLES) {
      try { localStorage.removeItem(CACHE_PREFIX + ct.table); } catch {}
    }
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }
}

// Use `as any` to bypass strict Supabase typing for dynamic table names
const db = supabase as any;

export function useOfflineSync(): OfflineSyncState {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueLength, setQueueLength] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    localStorage.getItem("offline_last_synced") || null
  );
  const syncingRef = useRef(false);

  // ── Online/Offline listeners ──
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success("Back online! Syncing pending changes...", { duration: 3000 });
      syncQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning("You're offline. Changes will be saved locally and synced when reconnected.", { duration: 5000 });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Periodic connectivity check every 30s
    const interval = setInterval(() => {
      if (navigator.onLine && !syncingRef.current) {
        fetch(`${import.meta.env.VITE_SUPABASE_URL || ""}/rest/v1/`, {
          method: "HEAD",
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "" },
        }).then(() => {
          setIsOnline(true);
        }).catch(() => {
          setIsOnline(false);
        });
      }
    }, 30000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  // ── Queue management ──
  const getQueue = useCallback((): QueuedMutation[] => safeGet(OFFLINE_QUEUE_KEY, []), []);

  useEffect(() => {
    setQueueLength(getQueue().length);
  }, [getQueue]);

  const addToQueue = useCallback((mutation: Omit<QueuedMutation, "id" | "timestamp">) => {
    const queue = safeGet<QueuedMutation[]>(OFFLINE_QUEUE_KEY, []);
    queue.push({ id: crypto.randomUUID(), timestamp: Date.now(), ...mutation });
    safeSet(OFFLINE_QUEUE_KEY, queue);
    setQueueLength(queue.length);
  }, []);

  // ── Cache all data ──
  const cacheAllData = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const promises = CACHE_TABLES.map(async (ct) => {
        let query = db.from(ct.table).select(ct.select);
        if (ct.order) query = query.order(ct.order, { ascending: ct.ascending ?? true });
        query = query.limit(5000);
        const { data } = await query;
        if (data) safeSet(CACHE_PREFIX + ct.table, data);
      });
      await Promise.allSettled(promises);
      const now = new Date().toISOString();
      localStorage.setItem("offline_last_synced", now);
      setLastSyncedAt(now);
    } catch (e) {
      console.error("Failed to cache offline data:", e);
    }
  }, []);

  useEffect(() => {
    if (isOnline) cacheAllData();
    const interval = setInterval(() => {
      if (navigator.onLine) cacheAllData();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isOnline, cacheAllData]);

  const getCachedData = useCallback(<T = any>(table: string): T[] => {
    return safeGet<T[]>(CACHE_PREFIX + table, []);
  }, []);

  // ── Execute a single queued mutation ──
  const executeMutation = async (entry: QueuedMutation) => {
    if (entry.operation === "insert") {
      const { data, error } = await db.from(entry.table).insert(entry.payload).select().single();
      if (error) throw error;
      if (entry.relatedInserts && data) {
        for (const rel of entry.relatedInserts) {
          const items = rel.items.map((item: any) => ({
            ...item,
            ...(rel.foreignKey ? { [rel.foreignKey]: data.id } : {}),
          }));
          await db.from(rel.table).insert(items);
        }
      }
      if (entry.stockUpdates) {
        for (const su of entry.stockUpdates) {
          const { data: prod } = await db.from("products").select("quantity").eq("id", su.productId).single();
          if (prod) {
            await db.from("products").update({ quantity: Math.max(0, (prod.quantity || 0) + su.quantityChange) }).eq("id", su.productId);
          }
        }
      }
      return data;
    } else if (entry.operation === "update") {
      let q = db.from(entry.table).update(entry.payload);
      if (entry.match) for (const [k, v] of Object.entries(entry.match)) q = q.eq(k, v);
      const { error } = await q;
      if (error) throw error;
    } else if (entry.operation === "delete") {
      let q = db.from(entry.table).delete();
      if (entry.match) for (const [k, v] of Object.entries(entry.match)) q = q.eq(k, v);
      const { error } = await q;
      if (error) throw error;
    } else if (entry.operation === "upsert") {
      const { error } = await db.from(entry.table).upsert(entry.payload);
      if (error) throw error;
    }
  };

  // ── Sync queue ──
  const syncQueue = useCallback(async () => {
    if (syncingRef.current) return;
    const queue = safeGet<QueuedMutation[]>(OFFLINE_QUEUE_KEY, []);
    if (queue.length === 0) return;

    syncingRef.current = true;
    setSyncing(true);
    let synced = 0;
    const failed: QueuedMutation[] = [];

    for (const entry of queue) {
      try {
        await executeMutation(entry);
        synced++;
      } catch (err) {
        console.error(`Sync failed [${entry.operation} ${entry.table}]:`, err);
        failed.push(entry);
      }
    }

    safeSet(OFFLINE_QUEUE_KEY, failed);
    setQueueLength(failed.length);
    syncingRef.current = false;
    setSyncing(false);

    if (synced > 0) {
      toast.success(`✓ Synced ${synced} offline change${synced > 1 ? "s" : ""}`);
      cacheAllData();
    }
    if (failed.length > 0) toast.error(`${failed.length} change${failed.length > 1 ? "s" : ""} failed to sync`);
  }, [cacheAllData]);

  useEffect(() => {
    if (isOnline) syncQueue();
  }, [isOnline, syncQueue]);

  // ── Unified mutation wrapper ──
  const offlineMutation = useCallback(async (opts: OfflineMutationOpts) => {
    if (navigator.onLine) {
      try {
        let result: any = null;

        if (opts.operation === "insert") {
          const q = opts.select !== false
            ? db.from(opts.table).insert(opts.payload).select().single()
            : db.from(opts.table).insert(opts.payload);
          const { data, error } = await q;
          if (error) throw error;
          result = data;

          if (opts.relatedInserts && result) {
            for (const rel of opts.relatedInserts) {
              const items = rel.items.map((item: any) => ({
                ...item,
                ...(rel.foreignKey ? { [rel.foreignKey]: result.id } : {}),
              }));
              await db.from(rel.table).insert(items);
            }
          }
          if (opts.stockUpdates) {
            for (const su of opts.stockUpdates) {
              const { data: prod } = await db.from("products").select("quantity").eq("id", su.productId).single();
              if (prod) {
                await db.from("products").update({ quantity: Math.max(0, (prod.quantity || 0) + su.quantityChange) }).eq("id", su.productId);
              }
            }
          }
        } else if (opts.operation === "update") {
          let q = db.from(opts.table).update(opts.payload);
          if (opts.match) for (const [k, v] of Object.entries(opts.match)) q = q.eq(k, v);
          const { data, error } = await q.select();
          if (error) throw error;
          result = data;
        } else if (opts.operation === "delete") {
          let q = db.from(opts.table).delete();
          if (opts.match) for (const [k, v] of Object.entries(opts.match)) q = q.eq(k, v);
          const { error } = await q;
          if (error) throw error;
        } else if (opts.operation === "upsert") {
          const { data, error } = await db.from(opts.table).upsert(opts.payload).select();
          if (error) throw error;
          result = data;
        }

        opts.onSuccess?.(result);
        return result;
      } catch (err: any) {
        // Network error → queue offline
        if (err instanceof TypeError && err.message?.includes("fetch")) {
          setIsOnline(false);
          addToQueue({
            table: opts.table, operation: opts.operation, payload: opts.payload,
            match: opts.match, description: opts.description,
            relatedInserts: opts.relatedInserts, stockUpdates: opts.stockUpdates,
          });
          toast.info(`Saved offline: ${opts.description}`);
          return null;
        }
        opts.onError?.(err);
        throw err;
      }
    } else {
      // Queue offline
      addToQueue({
        table: opts.table, operation: opts.operation, payload: opts.payload,
        match: opts.match, description: opts.description,
        relatedInserts: opts.relatedInserts, stockUpdates: opts.stockUpdates,
      });
      toast.info(`Saved offline: ${opts.description}`);

      // Optimistic local cache update for inserts
      if (opts.operation === "insert" && opts.payload) {
        const cached = safeGet<any[]>(CACHE_PREFIX + opts.table, []);
        const newEntry = { ...opts.payload, id: opts.payload.id || crypto.randomUUID(), _offline: true };
        cached.unshift(newEntry);
        safeSet(CACHE_PREFIX + opts.table, cached);
        opts.onSuccess?.(newEntry);
        return newEntry;
      }
      return null;
    }
  }, [addToQueue]);

  return {
    isOnline, queueLength, syncing, lastSyncedAt,
    addToQueue, syncQueue, getCachedData, cacheAllData, offlineMutation,
  };
}
