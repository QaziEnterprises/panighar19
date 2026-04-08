import { supabase } from "@/integrations/supabase/customClient";

/**
 * Retry wrapper for Supabase queries.
 * Automatically retries on transient "Failed to fetch" / network errors.
 */
export async function retryQuery<T>(
  queryFn: () => PromiseLike<{ data: T; error: any }>,
  maxRetries = 3,
  delayMs = 800
): Promise<{ data: T; error: any }> {
  let lastError: any = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await queryFn();
      // If it's a network-level error (not a Postgres/RLS error), retry
      if (result.error && isTransient(result.error) && attempt < maxRetries) {
        lastError = result.error;
        await sleep(delayMs * (attempt + 1));
        continue;
      }
      return result;
    } catch (e: any) {
      if (isTransient(e) && attempt < maxRetries) {
        lastError = e;
        await sleep(delayMs * (attempt + 1));
        continue;
      }
      return { data: null as any, error: e };
    }
  }
  return { data: null as any, error: lastError };
}

/**
 * Retry wrapper for Supabase mutations (insert/update/delete).
 * Only retries on network failures, NOT on RLS or constraint errors.
 */
export async function retryMutation<T>(
  mutationFn: () => PromiseLike<{ data: T; error: any }>,
  maxRetries = 2,
  delayMs = 1000
): Promise<{ data: T; error: any }> {
  return retryQuery(mutationFn, maxRetries, delayMs);
}

function isTransient(error: any): boolean {
  if (!error) return false;
  const msg = (error.message || error.details || String(error)).toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed") ||
    msg.includes("fetch error") ||
    msg.includes("econnrefused") ||
    msg.includes("timeout")
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
