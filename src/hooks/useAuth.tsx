import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/customClient";
import { retryQuery } from "@/lib/retryFetch";
import type { User } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  role: "admin" | "user" | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<"admin" | "user" | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRole = async (userId: string): Promise<"admin" | "user"> => {
    try {
      const result = await retryQuery(
        () => supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
        3, 1000
      );
      if (result && typeof result === "object" && "data" in result && result.data) {
        return ((result.data as any)?.role as "admin" | "user") || "user";
      }
      return "user";
    } catch (e) {
      console.warn("auth:role fetch failed, defaulting to user", e);
      return "user";
    }
  };

  useEffect(() => {
    console.log("auth:init");
    let mounted = true;

    // Set up auth listener FIRST (non-blocking role fetch inside)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        // Fire-and-forget role fetch — do NOT await inside listener
        fetchRole(currentUser.id).then((r) => {
          if (mounted) {
            setRole(r);
            console.log("auth:role", r);
          }
        });
      } else {
        setRole(null);
      }
      setLoading(false);
      console.log("auth:state", event);
    });

    // Then get initial session with timeout
    const initSession = async () => {
      try {
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          7000,
          { data: { session: null } } as any
        );
        if (!mounted) return;
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          const r = await fetchRole(currentUser.id);
          if (mounted) setRole(r);
        }
      } catch (e) {
        console.error("auth:init error", e);
      } finally {
        if (mounted) {
          setLoading(false);
          console.log("auth:done");
        }
      }
    };
    initSession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message || null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
