import { useEffect, useState, useCallback, Component, ErrorInfo, ReactNode, lazy, Suspense } from "react";
import { useAppSettings, useSessionTimeout } from "@/hooks/useAppSettings";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import CustomCursor from "@/components/CustomCursor";
import LoginPage from "@/pages/LoginPage";
import { initializeDefaultData } from "@/lib/store";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// Lazy load all pages for performance
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const InventoryPage = lazy(() => import("@/pages/InventoryPage"));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage"));
const AdminPage = lazy(() => import("@/pages/AdminPage"));
const ContactsPage = lazy(() => import("@/pages/ContactsPage"));
const ProductsPage = lazy(() => import("@/pages/ProductsPage"));
const PurchasesPage = lazy(() => import("@/pages/PurchasesPage"));
const ExpensesPage = lazy(() => import("@/pages/ExpensesPage"));
const POSPage = lazy(() => import("@/pages/POSPage"));
const ReportsPage = lazy(() => import("@/pages/ReportsPage"));
const BillsPage = lazy(() => import("@/pages/BillsPage"));
const SummaryPage = lazy(() => import("@/pages/SummaryPage"));
const LedgerPage = lazy(() => import("@/pages/LedgerPage"));
const AuditPage = lazy(() => import("@/pages/AuditPage"));
const ProfitCalculatorPage = lazy(() => import("@/pages/ProfitCalculatorPage"));
const BackupPage = lazy(() => import("@/pages/BackupPage"));
const PriceListPage = lazy(() => import("@/pages/PriceListPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const queryClient = new QueryClient();

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App Error Boundary:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: "center", fontFamily: "sans-serif" }}>
          <h1 style={{ fontSize: 24, marginBottom: 12 }}>Something went wrong</h1>
          <p style={{ color: "#666", marginBottom: 16 }}>{this.state.error}</p>
          <button onClick={() => window.location.reload()} style={{ padding: "8px 24px", cursor: "pointer", background: "#f59e0b", border: "none", borderRadius: 6, color: "#fff", fontWeight: 600 }}>
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, role, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  const handleSessionTimeout = useCallback(async () => {
    if (!user) return;
    const { supabase: sb } = await import("@/integrations/supabase/customClient");
    await sb.auth.signOut();
    toast.warning("Session expired due to inactivity. Please log in again.");
    navigate("/login");
  }, [user, navigate]);

  useSessionTimeout(handleSessionTimeout);

  useEffect(() => {
    initializeDefaultData()
      .then(() => setReady(true))
      .catch((err) => {
        console.error("Init error:", err);
        setReady(true);
      });
    const timer = setTimeout(() => setReady(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  if (loading || !ready) {
    const showRecovery = ready && loading;
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 32, height: 32, border: "3px solid #e5e7eb", borderTopColor: "#f59e0b", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
          <p style={{ color: "#666", marginBottom: 16 }}>Loading...</p>
          {showRecovery && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
              <button onClick={() => window.location.reload()} style={{ padding: "8px 24px", cursor: "pointer", background: "#f59e0b", border: "none", borderRadius: 6, color: "#fff", fontWeight: 600 }}>
                Retry
              </button>
              <button onClick={async () => { const { supabase: sb } = await import("@/integrations/supabase/customClient"); await sb.auth.signOut(); window.location.href = "/login"; }} style={{ padding: "6px 20px", cursor: "pointer", background: "transparent", border: "1px solid #ccc", borderRadius: 6, color: "#666", fontSize: 13 }}>
                Sign out &amp; return to login
              </button>
            </div>
          )}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  const pageFallback = (
    <div className="flex items-center justify-center h-[calc(100vh-6rem)]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );

  if (!user) return <Routes><Route path="/login" element={<LoginPage />} /><Route path="/reset-password" element={<Suspense fallback={pageFallback}><ResetPasswordPage /></Suspense>} /><Route path="*" element={<Navigate to="/login" replace />} /></Routes>;

  return (
    <AppLayout>
      <Suspense fallback={pageFallback}>
        <Routes>
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/inventory" element={<ProtectedRoute><InventoryPage /></ProtectedRoute>} />
          <Route path="/contacts" element={<ProtectedRoute><ContactsPage /></ProtectedRoute>} />
          <Route path="/products-db" element={<ProtectedRoute><ProductsPage /></ProtectedRoute>} />
          <Route path="/purchases" element={<ProtectedRoute><PurchasesPage /></ProtectedRoute>} />
          <Route path="/expenses" element={<ProtectedRoute><ExpensesPage /></ProtectedRoute>} />
          <Route path="/pos" element={<ProtectedRoute><POSPage /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
          <Route path="/bills" element={<ProtectedRoute><BillsPage /></ProtectedRoute>} />
          <Route path="/summary" element={<ProtectedRoute><SummaryPage /></ProtectedRoute>} />
          <Route path="/ledger" element={<ProtectedRoute><LedgerPage /></ProtectedRoute>} />
          <Route path="/profit" element={<ProtectedRoute><ProfitCalculatorPage /></ProtectedRoute>} />
          <Route path="/backup" element={<ProtectedRoute><BackupPage /></ProtectedRoute>} />
          <Route path="/price-list" element={<ProtectedRoute><PriceListPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="/audit" element={<ProtectedRoute adminOnly><AuditPage /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AppLayout>
  );
}

const App = () => {
  useAppSettings();

  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      console.error("Unhandled rejection:", event.reason);
      event.preventDefault();
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <CustomCursor />
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
