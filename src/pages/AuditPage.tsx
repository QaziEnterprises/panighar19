import { useState, useEffect } from "react";
import { Search, X, ClipboardList, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/customClient";
import { motion } from "framer-motion";
import { exportToExcel } from "@/lib/exportUtils";
import { toast } from "sonner";

interface AuditLog {
  id: string; user_id: string | null; user_email: string | null; action: string;
  entity_type: string; entity_id: string | null; description: string | null;
  created_at: string;
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [filterEntity, setFilterEntity] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      let query = supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(500);
      if (dateFrom) query = query.gte("created_at", dateFrom);
      if (dateTo) query = query.lte("created_at", dateTo + "T23:59:59");
      const { data, error } = await query;
      if (error) { console.error("Audit fetch error:", error); toast.error("Failed to load audit logs"); }
      setLogs((data as unknown as AuditLog[]) || []);
      setLoading(false);
    };
    fetchLogs();
  }, [dateFrom, dateTo]);

  const filtered = logs.filter((l) => {
    if (filterAction !== "all" && l.action !== filterAction) return false;
    if (filterEntity !== "all" && l.entity_type !== filterEntity) return false;
    if (search && !(l.user_email || "").toLowerCase().includes(search.toLowerCase()) && !l.description?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const actionColor = (a: string) => a === "create" ? "default" : a === "update" ? "secondary" : "destructive";
  const entityTypes = [...new Set(logs.map(l => l.entity_type))];

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-6 w-6" /> Audit Trail
          </h1>
          <p className="text-sm text-muted-foreground">{filtered.length} activity logs</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-2" disabled={filtered.length === 0} onClick={() => {
            exportToExcel(filtered.map(l => ({
              Date: new Date(l.created_at).toLocaleString(), User: l.user_email || "System",
              Action: l.action, Entity: l.entity_type, Description: l.description || "",
            })), "Audit_Logs");
            toast.success("Exported");
          }}><Download className="h-4 w-4" /> Excel</Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by user or description..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
        </div>
        <Select value={filterAction} onValueChange={setFilterAction}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Action" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            <SelectItem value="create">Create</SelectItem>
            <SelectItem value="update">Update</SelectItem>
            <SelectItem value="delete">Delete</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterEntity} onValueChange={setFilterEntity}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Entity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Entities</SelectItem>
            {entityTypes.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">No audit logs found.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Time</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">User</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Action</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Entity</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Description</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l, i) => (
                <motion.tr key={l.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.005 }} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-muted-foreground">{l.user_email || "System"}</td>
                  <td className="px-4 py-3"><Badge variant={actionColor(l.action)}>{l.action}</Badge></td>
                  <td className="px-4 py-3"><Badge variant="outline">{l.entity_type}</Badge></td>
                  <td className="px-4 py-3">{l.description || "—"}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
