import { useState, useRef, useCallback, useEffect } from "react";
import { Package, ShieldAlert } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/customClient";
import { toast } from "sonner";

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60_000;
const ATTEMPT_WINDOW_MS = 300_000;

async function checkServerRateLimit(email: string): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const { data, error } = await supabase.functions.invoke("rate-limit", {
      body: { email, action: "check" },
    });
    if (error) throw error;
    return { allowed: data?.allowed ?? true, remaining: data?.remaining ?? MAX_ATTEMPTS };
  } catch {
    return { allowed: true, remaining: MAX_ATTEMPTS };
  }
}

async function recordServerAttempt(email: string) {
  try {
    await supabase.functions.invoke("rate-limit", { body: { email, action: "record" } });
  } catch { /* best-effort */ }
}

async function clearServerAttempts(email: string) {
  try {
    await supabase.functions.invoke("rate-limit", { body: { email, action: "clear" } });
  } catch { /* best-effort */ }
}

export default function LoginPage() {
  const savedCreds = (() => { try { const s = localStorage.getItem("remembered_user"); return s ? JSON.parse(s) : null; } catch { return null; } })();
  const { signIn } = useAuth();
  const [email, setEmail] = useState(savedCreds?.email || "");
  const [password, setPassword] = useState(savedCreds?.password || "");
  const [rememberMe, setRememberMe] = useState(!!savedCreds);
  const [loading, setLoading] = useState(false);
  const [lockoutEnd, setLockoutEnd] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const attemptsRef = useRef<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Forgot password state
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  const startLockoutTimer = useCallback((endTime: number) => {
    setLockoutEnd(endTime);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const left = Math.ceil((endTime - Date.now()) / 1000);
      if (left <= 0) {
        setLockoutEnd(null);
        setRemainingSeconds(0);
        if (timerRef.current) clearInterval(timerRef.current);
      } else {
        setRemainingSeconds(left);
      }
    }, 1000);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutEnd && Date.now() < lockoutEnd) {
      toast.error(`Too many attempts. Try again in ${remainingSeconds}s.`);
      return;
    }
    const now = Date.now();
    attemptsRef.current = attemptsRef.current.filter(t => now - t < ATTEMPT_WINDOW_MS);
    if (attemptsRef.current.length >= MAX_ATTEMPTS) {
      const lockEnd = now + LOCKOUT_DURATION_MS;
      startLockoutTimer(lockEnd);
      toast.error("Too many failed attempts. Locked for 60 seconds.");
      return;
    }

    setLoading(true);
    const serverCheck = await checkServerRateLimit(email);
    if (!serverCheck.allowed) {
      const lockEnd = Date.now() + LOCKOUT_DURATION_MS;
      startLockoutTimer(lockEnd);
      toast.error("Too many failed attempts. Please wait 15 minutes.");
      setLoading(false);
      return;
    }

    const { error } = await signIn(email, password);
    if (error) {
      attemptsRef.current.push(Date.now());
      await recordServerAttempt(email);
      const remaining = Math.min(MAX_ATTEMPTS - attemptsRef.current.length, serverCheck.remaining - 1);
      if (remaining > 0) {
        toast.error(`${error} (${remaining} attempt${remaining === 1 ? "" : "s"} remaining)`);
      } else {
        const lockEnd = Date.now() + LOCKOUT_DURATION_MS;
        startLockoutTimer(lockEnd);
        toast.error("Too many failed attempts. Locked for 60 seconds.");
      }
    } else {
      attemptsRef.current = [];
      await clearServerAttempts(email);
      if (rememberMe) {
        localStorage.setItem("remembered_user", JSON.stringify({ email, password }));
      } else {
        localStorage.removeItem("remembered_user");
      }
    }
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      toast.error("Please enter your email address.");
      return;
    }
    setForgotLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password reset link sent! Check your email.");
      setShowForgot(false);
      setForgotEmail("");
    }
    setForgotLoading(false);
  };

  if (showForgot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-accent">
              <Package className="h-6 w-6 text-accent-foreground" />
            </div>
            <CardTitle className="text-2xl">Reset Password</CardTitle>
            <p className="text-sm text-muted-foreground">Enter your email to receive a reset link</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={forgotLoading}>
                {forgotLoading ? "Sending..." : "Send Reset Link"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setShowForgot(false)}>
                Back to Sign In
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-accent">
            <Package className="h-6 w-6 text-accent-foreground" />
          </div>
          <CardTitle className="text-2xl">Qazi Enterprises</CardTitle>
          <p className="text-sm text-muted-foreground">Sign in to your account</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Password</Label>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-accent-foreground transition-colors"
                  onClick={() => {
                    setShowForgot(true);
                    setForgotEmail(email);
                  }}
                >
                  Forgot password?
                </button>
              </div>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="remember-me"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked === true)}
              />
              <Label htmlFor="remember-me" className="text-sm font-normal cursor-pointer">
                Remember me
              </Label>
            </div>
            {lockoutEnd && Date.now() < lockoutEnd && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>Account locked. Try again in {remainingSeconds}s.</span>
              </div>
            )}
            <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={loading || (!!lockoutEnd && Date.now() < lockoutEnd)}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
