import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/customClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Cloud, CloudOff, HardDrive, Clock, CheckCircle2, XCircle, Loader2,
  RefreshCw, RotateCcw, Timer, FileJson, AlertTriangle, Download, Upload,
} from "lucide-react";
import { format } from "date-fns";
import { toast as sonnerToast } from "sonner";

interface BackupRecord {
  id: string;
  file_name: string;
  drive_file_id: string | null;
  status: string;
  tables_backed_up: string[] | null;
  size_bytes: number | null;
  error_message: string | null;
  created_at: string;
}

interface DriveFile {
  id: string;
  name: string;
  size: string;
  createdTime: string;
}

const LOCAL_BACKUP_TABLES = [
  "contacts", "products", "product_categories", "sale_transactions", "sale_items",
  "purchases", "purchase_items", "expenses", "expense_categories", "ledger_entries",
  "daily_summaries", "cash_register", "price_lists", "price_list_items",
  "audit_logs", "todos", "backup_history", "receivable_payments",
];

export default function BackupPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [history, setHistory] = useState<BackupRecord[]>([]);
  const [localBackingUp, setLocalBackingUp] = useState(false);
  const [localRestoring, setLocalRestoring] = useState(false);

  // Restore state
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);

  useEffect(() => {
    checkConnection();
    loadHistory();
    if (searchParams.get("connected") === "true") {
      toast({ title: "Google Drive Connected!", description: "You can now create backups." });
    }
  }, []);

  async function checkConnection() {
    setLoading(true);
    const { data } = await supabase
      .from("google_drive_tokens")
      .select("id")
      .eq("user_id", user?.id || "")
      .maybeSingle();
    setConnected(!!data);
    setLoading(false);
  }

  async function loadHistory() {
    const { data } = await supabase
      .from("backup_history")
      .select("*")
      .eq("user_id", user?.id || "")
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setHistory(data as unknown as BackupRecord[]);
  }

  async function connectDrive() {
    setConnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("google-drive-auth", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        toast({ title: "Error", description: res.data?.error || "Failed to get auth URL", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setConnecting(false);
  }

  async function runBackup() {
    setBackingUp(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("google-drive-backup", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.data?.success) {
        toast({ title: "Backup Complete!", description: `${res.data.tables_count} tables backed up to Google Drive.` });
        loadHistory();
      } else {
        toast({ title: "Backup Failed", description: res.data?.error || "Unknown error", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setBackingUp(false);
  }

  async function disconnectDrive() {
    await supabase.from("google_drive_tokens").delete().eq("user_id", user?.id || "");
    setConnected(false);
    toast({ title: "Disconnected", description: "Google Drive has been disconnected." });
  }

  async function openRestoreDialog() {
    setRestoreDialogOpen(true);
    setLoadingFiles(true);
    setSelectedFile(null);
    setConfirmRestore(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("google-drive-restore", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { action: "list" },
      });
      setDriveFiles(res.data?.files || []);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setLoadingFiles(false);
  }

  async function executeRestore() {
    if (!selectedFile) return;
    setRestoring(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("google-drive-restore", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { action: "restore", file_id: selectedFile.id },
      });
      if (res.data?.success) {
        toast({
          title: "Restore Complete!",
          description: `${res.data.tables_restored} tables restored with ${res.data.total_records} records.`,
        });
        setRestoreDialogOpen(false);
      } else {
        toast({ title: "Restore Failed", description: res.data?.error || "Unknown error", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setRestoring(false);
  }

  // Local Backup - download all tables as JSON
  async function localBackup() {
    setLocalBackingUp(true);
    try {
      const backupData: Record<string, any[]> = {};
      for (const table of LOCAL_BACKUP_TABLES) {
        const { data } = await supabase.from(table as any).select("*");
        backupData[table] = data || [];
      }
      const blob = new Blob([JSON.stringify({ version: 1, created_at: new Date().toISOString(), tables: backupData }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `qazi_backup_${format(new Date(), "yyyy-MM-dd_HHmmss")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      sonnerToast.success("Local backup downloaded successfully!");
    } catch (err: any) {
      sonnerToast.error("Failed to create local backup: " + err.message);
    }
    setLocalBackingUp(false);
  }

  // Local Restore - upload JSON file
  async function localRestore() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setLocalRestoring(true);
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.tables) throw new Error("Invalid backup format");

        let totalRecords = 0;
        let tablesRestored = 0;

        for (const table of LOCAL_BACKUP_TABLES) {
          if (data.tables[table] && Array.isArray(data.tables[table]) && data.tables[table].length > 0) {
            // Delete existing then insert
            await supabase.from(table as any).delete().neq("id", "00000000-0000-0000-0000-000000000000");
            // Insert in batches of 100
            const records = data.tables[table];
            for (let i = 0; i < records.length; i += 100) {
              const batch = records.slice(i, i + 100);
              await supabase.from(table as any).insert(batch);
            }
            totalRecords += records.length;
            tablesRestored++;
          }
        }

        sonnerToast.success(`Restored ${tablesRestored} tables with ${totalRecords} records from local backup!`);
      } catch (err: any) {
        sonnerToast.error("Failed to restore: " + err.message);
      }
      setLocalRestoring(false);
    };
    input.click();
  }

  function formatBytes(bytes: number | string | null) {
    const n = typeof bytes === "string" ? parseInt(bytes) : bytes;
    if (!n) return "—";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Backup & Restore</h1>
        <p className="text-muted-foreground">Keep your business data safe with cloud or local backups.</p>
      </div>

      {/* Local Backup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-primary" />
            Local Backup
          </CardTitle>
          <CardDescription>Download or restore your data as a JSON file on your device.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button onClick={localBackup} disabled={localBackingUp} variant="default">
            {localBackingUp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {localBackingUp ? "Downloading..." : "Download Backup"}
          </Button>
          <Button onClick={localRestore} disabled={localRestoring} variant="secondary">
            {localRestoring ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {localRestoring ? "Restoring..." : "Restore from File"}
          </Button>
        </CardContent>
      </Card>

      {/* Google Drive Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {connected ? <Cloud className="h-5 w-5 text-primary" /> : <CloudOff className="h-5 w-5 text-muted-foreground" />}
            Google Drive Backup
          </CardTitle>
          <CardDescription>
            {connected
              ? "Connected. Automatic backups run daily at midnight."
              : "Connect your Google account to enable cloud backups."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {connected ? (
            <>
              <Button onClick={runBackup} disabled={backingUp}>
                {backingUp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Cloud className="mr-2 h-4 w-4" />}
                {backingUp ? "Backing up..." : "Backup to Drive"}
              </Button>
              <Button variant="secondary" onClick={openRestoreDialog}>
                <RotateCcw className="mr-2 h-4 w-4" /> Restore from Drive
              </Button>
              <Button variant="outline" onClick={disconnectDrive}>
                Disconnect
              </Button>
            </>
          ) : (
            <Button onClick={connectDrive} disabled={connecting}>
              {connecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Cloud className="mr-2 h-4 w-4" />}
              Connect Google Drive
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Auto-Backup Status */}
      {connected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Timer className="h-5 w-5" />
              Automatic Daily Backup
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> Active
              </Badge>
              <span className="text-sm text-muted-foreground">
                Runs every day at <strong>12:00 AM (midnight UTC)</strong>.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Backup History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Backup History
          </CardTitle>
          <CardDescription>Your recent backups stored in QaziEnterprisesBackups folder.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No backups yet.</p>
          ) : (
            <div className="space-y-3">
              {history.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    {b.status === "completed" ? (
                      <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-destructive shrink-0" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{b.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(b.created_at), "MMM d, yyyy h:mm a")} · {b.tables_backed_up?.length || 0} tables · {formatBytes(b.size_bytes)}
                      </p>
                    </div>
                  </div>
                  <Badge variant={b.status === "completed" ? "default" : "destructive"}>
                    {b.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
          {history.length > 0 && (
            <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={loadHistory}>
              <RefreshCw className="mr-2 h-3 w-3" /> Refresh
            </Button>
          )}
        </CardContent>
      </Card>

      {/* What gets backed up */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What gets backed up?</CardTitle>
          <CardDescription>All your business data across these tables.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm text-muted-foreground">
            {["Contacts", "Products", "Categories", "Purchases", "Sales", "Expenses", "Ledger Entries", "Sale Items", "Purchase Items", "Daily Summaries", "Cash Register", "Price Lists", "Price List Items", "Audit Logs", "Todos", "Backup History", "Receivable Payments"].map((t) => (
              <div key={t} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> {t}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Restore Dialog */}
      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5" /> Restore from Google Drive
            </DialogTitle>
            <DialogDescription>
              Select a backup file from Google Drive to restore your data.
            </DialogDescription>
          </DialogHeader>

          {loadingFiles ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : driveFiles.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No backup files found.</p>
          ) : !confirmRestore ? (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {driveFiles.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFile(f)}
                  className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent ${
                    selectedFile?.id === f.id ? "border-primary bg-accent" : ""
                  }`}
                >
                  <FileJson className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{f.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(f.createdTime), "MMM d, yyyy h:mm a")} · {formatBytes(f.size)}
                    </p>
                  </div>
                  {selectedFile?.id === f.id && (
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">This will replace ALL current data</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Restoring from <strong>{selectedFile?.name}</strong> will delete existing records and replace them with the backup data. This cannot be undone.
                  </p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            {!confirmRestore ? (
              <Button
                onClick={() => setConfirmRestore(true)}
                disabled={!selectedFile}
              >
                Next
              </Button>
            ) : (
              <div className="flex gap-2 w-full justify-end">
                <Button variant="outline" onClick={() => setConfirmRestore(false)}>
                  Back
                </Button>
                <Button variant="destructive" onClick={executeRestore} disabled={restoring}>
                  {restoring ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                  {restoring ? "Restoring..." : "Confirm Restore"}
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
