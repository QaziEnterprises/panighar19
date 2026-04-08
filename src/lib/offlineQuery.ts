import { supabase } from "@/integrations/supabase/customClient";

const CACHE_PREFIX = "offline_cache_";
const db = supabase as any;

function safeGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function safeSet(key: string, value: any) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/**
 * Fetch data from Supabase if online, falling back to localStorage cache if offline.
 * Also updates the cache whenever online fetch succeeds.
 *
 * @param table - Supabase table name
 * @param opts - query options
 * @returns data array
 */
export async function offlineQuery<T = any>(
  table: string,
  opts?: {
    select?: string;
    eq?: Record<string, any>;
    order?: string;
    ascending?: boolean;
    limit?: number;
    filter?: (item: T) => boolean; // client-side filter for cached data
  }
): Promise<T[]> {
  const cacheKey = CACHE_PREFIX + table;

  if (navigator.onLine) {
    try {
      let query = db.from(table).select(opts?.select || "*");
      if (opts?.eq) {
        for (const [k, v] of Object.entries(opts.eq)) {
          query = query.eq(k, v);
        }
      }
      if (opts?.order) {
        query = query.order(opts.order, { ascending: opts.ascending ?? true });
      }
      if (opts?.limit) {
        query = query.limit(opts.limit);
      }
      const { data, error } = await query;
      if (error) throw error;
      const result = (data || []) as T[];

      // Update full table cache (only when no filters applied to get complete data)
      if (!opts?.eq && !opts?.limit) {
        safeSet(cacheKey, result);
      }

      return result;
    } catch (e) {
      console.warn(`offlineQuery: online fetch failed for ${table}, using cache`, e);
      // Fall through to cache
    }
  }

  // Offline or fetch failed: use cache
  let cached = safeGet<T[]>(cacheKey, []);

  // Apply client-side filters to match the eq conditions
  if (opts?.eq) {
    cached = cached.filter(item => {
      for (const [k, v] of Object.entries(opts.eq!)) {
        if ((item as any)[k] !== v) return false;
      }
      return true;
    });
  }

  // Apply custom filter
  if (opts?.filter) {
    cached = cached.filter(opts.filter);
  }

  // Apply ordering
  if (opts?.order) {
    const key = opts.order;
    const asc = opts.ascending ?? true;
    cached.sort((a: any, b: any) => {
      const va = a[key] ?? "";
      const vb = b[key] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb));
      return asc ? cmp : -cmp;
    });
  }

  // Apply limit
  if (opts?.limit) {
    cached = cached.slice(0, opts.limit);
  }

  return cached;
}

/**
 * Fetch a single row by matching conditions.
 */
export async function offlineQuerySingle<T = any>(
  table: string,
  match: Record<string, any>,
  select?: string
): Promise<T | null> {
  if (navigator.onLine) {
    try {
      let query = db.from(table).select(select || "*");
      for (const [k, v] of Object.entries(match)) {
        query = query.eq(k, v);
      }
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data as T | null;
    } catch (e) {
      console.warn(`offlineQuerySingle: online fetch failed for ${table}`, e);
    }
  }

  // Offline fallback
  const cached = safeGet<any[]>(CACHE_PREFIX + table, []);
  return (cached.find(item => {
    for (const [k, v] of Object.entries(match)) {
      if (item[k] !== v) return false;
    }
    return true;
  }) as T) || null;
}
