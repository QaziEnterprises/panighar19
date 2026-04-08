import { useState, useEffect } from "react";
import { offlineQuery } from "@/lib/offlineQuery";
import { Search, X, Download, BookOpen, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/customClient";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { exportToExcel } from "@/lib/exportUtils";

interface Contact {
  id: string; name: string; type: string; phone: string | null;
  current_balance: number; opening_balance: number;
}

interface LedgerEntry {
  id?: string;
  date: string; type: string; ref: string; description: string;
  debit: number; credit: number; balance: number;
}

interface LedgerEntryDB {
  id: string;
  contact_id: string;
  date: string;
  description: string;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  reference_type: string | null;
  reference_id: string | null;
}

export default function LedgerPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Manual entry form
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LedgerEntryDB | null>(null);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0]);
  const [entryDesc, setEntryDesc] = useState("");
  const [entryDebit, setEntryDebit] = useState(0);
  const [entryCredit, setEntryCredit] = useState(0);
  const [entryType, setEntryType] = useState("sale");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const data = await offlineQuery<Contact>("contacts", { order: "name" });
      setContacts(data);
      setLoading(false);
    };
    fetch();
  }, []);

  const filtered = contacts.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.type.toLowerCase().includes(search.toLowerCase())
  );

  const viewLedger = async (contact: Contact) => {
    setSelectedContact(contact);
    setLedgerLoading(true);
    setDialogOpen(true);
    await loadLedgerEntries(contact);
  };

  const loadLedgerEntries = async (contact: Contact) => {
    setLedgerLoading(true);
    const entries: LedgerEntry[] = [];

    let ledgerData = await offlineQuery<LedgerEntryDB>("ledger_entries", {
      eq: { contact_id: contact.id },
      order: "date",
    });
    if (dateFrom) ledgerData = ledgerData.filter(le => le.date >= dateFrom);
    if (dateTo) ledgerData = ledgerData.filter(le => le.date <= dateTo);

    if (ledgerData && ledgerData.length > 0) {
      for (const le of ledgerData) {
        entries.push({
          id: le.id,
          date: le.date,
          type: le.reference_type === 'opening' ? 'Opening' : le.reference_type === 'sale' ? 'Sale' : 'Payment',
          ref: le.description.split(' - ')[0] || "—",
          description: le.description,
          debit: Number(le.debit) || 0,
          credit: Number(le.credit) || 0,
          balance: Number(le.balance) || 0,
        });
      }
    } else {
      entries.push({
        date: "—", type: "Opening", ref: "—",
        description: "Opening Balance",
        debit: 0, credit: Number(contact.opening_balance) || 0, balance: Number(contact.opening_balance) || 0,
      });

      let sales = await offlineQuery<any>("sale_transactions", {
        eq: { customer_id: contact.id },
        order: "date",
      });
      if (dateFrom) sales = sales.filter((s: any) => s.date >= dateFrom);
      if (dateTo) sales = sales.filter((s: any) => s.date <= dateTo);

      for (const s of sales) {
        entries.push({
          date: s.date, type: "Sale", ref: s.invoice_no || "—",
          description: `Sale - ${s.payment_method} (${s.payment_status})`,
          debit: 0, credit: Number(s.total) || 0, balance: 0,
        });
      }

      let purchases = await offlineQuery<any>("purchases", {
        eq: { supplier_id: contact.id },
        order: "date",
      });
      if (dateFrom) purchases = purchases.filter((p: any) => p.date >= dateFrom);
      if (dateTo) purchases = purchases.filter((p: any) => p.date <= dateTo);

      for (const p of purchases) {
        entries.push({
          date: p.date, type: "Purchase", ref: p.reference_no || "—",
          description: `Purchase - ${p.payment_method} (${p.payment_status})`,
          debit: Number(p.total) || 0, credit: 0, balance: 0,
        });
      }

      entries.sort((a, b) => {
        if (a.date === "—") return -1;
        if (b.date === "—") return 1;
        return a.date.localeCompare(b.date);
      });

      let runningBalance = 0;
      for (const entry of entries) {
        if (entry.type === "Opening") {
          runningBalance = entry.credit;
          entry.balance = runningBalance;
        } else {
          runningBalance += entry.credit - entry.debit;
          entry.balance = runningBalance;
        }
      }
    }

    setLedger(entries);
    setLedgerLoading(false);
  };

  const totalDebit = ledger.reduce((s, e) => s + e.debit, 0);
  const totalCredit = ledger.reduce((s, e) => s + e.credit, 0);

  const resetForm = () => {
    setEntryDate(new Date().toISOString().split("T")[0]);
    setEntryDesc("");
    setEntryDebit(0);
    setEntryCredit(0);
    setEntryType("sale");
    setEditingEntry(null);
    setShowAddForm(false);
  };

  const handleSaveEntry = async () => {
    if (!selectedContact) return;
    if (!entryDesc.trim()) { toast.error("Enter description"); return; }
    if (entryDebit === 0 && entryCredit === 0) { toast.error("Enter debit or credit amount"); return; }

    setSaving(true);

    // Get last balance
    const { data: lastEntries } = await supabase
      .from("ledger_entries")
      .select("balance")
      .eq("contact_id", selectedContact.id)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    const prevBalance = lastEntries && lastEntries.length > 0 ? Number(lastEntries[0].balance) || 0 : 0;
    const newBalance = prevBalance + entryCredit - entryDebit;

    if (editingEntry) {
      const { error } = await supabase.from("ledger_entries").update({
        date: entryDate,
        description: entryDesc,
        debit: entryDebit,
        credit: entryCredit,
        balance: newBalance,
        reference_type: entryType,
      }).eq("id", editingEntry.id);

      if (error) { toast.error("Failed to update entry"); setSaving(false); return; }
      toast.success("Ledger entry updated");
    } else {
      const { error } = await supabase.from("ledger_entries").insert({
        contact_id: selectedContact.id,
        date: entryDate,
        description: entryDesc,
        debit: entryDebit,
        credit: entryCredit,
        balance: newBalance,
        reference_type: entryType,
      });

      if (error) { toast.error("Failed to add entry"); setSaving(false); return; }
      toast.success("Ledger entry added");
    }

    // Update contact balance
    await supabase.from("contacts").update({ current_balance: newBalance }).eq("id", selectedContact.id);

    resetForm();
    setSaving(false);
    await loadLedgerEntries(selectedContact);
  };

  const handleEditEntry = async (entry: LedgerEntry) => {
    if (!entry.id) { toast.error("This entry cannot be edited"); return; }
    
    const { data } = await supabase.from("ledger_entries").select("*").eq("id", entry.id).single();
    if (!data) { toast.error("Entry not found"); return; }

    setEditingEntry(data as LedgerEntryDB);
    setEntryDate(data.date);
    setEntryDesc(data.description);
    setEntryDebit(Number(data.debit) || 0);
    setEntryCredit(Number(data.credit) || 0);
    setEntryType(data.reference_type || "sale");
    setShowAddForm(true);
  };

  const handleDeleteEntry = async (entry: LedgerEntry) => {
    if (!entry.id || !selectedContact) { toast.error("This entry cannot be deleted"); return; }
    if (!confirm("Delete this ledger entry?")) return;

    const { error } = await supabase.from("ledger_entries").delete().eq("id", entry.id);
    if (error) { toast.error("Failed to delete"); return; }
    toast.success("Entry deleted");
    await loadLedgerEntries(selectedContact);
  };

  const handleExportExcel = () => {
    if (!selectedContact) return;
    exportToExcel(ledger.map(e => ({
      Date: e.date, Type: e.type, Reference: e.ref, Description: e.description,
      Debit: e.debit, Credit: e.credit, Balance: e.balance,
    })), `Ledger_${selectedContact.name}`, "Ledger");
    toast.success("Exported to Excel");
  };


  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BookOpen className="h-6 w-6" /> Customer Ledger
        </h1>
        <p className="text-sm text-muted-foreground">View account statements for all contacts</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search contacts..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
        </div>
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" placeholder="From" />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" placeholder="To" />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">No contacts found.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
              <Card className="cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => viewLedger(c)}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    {c.name}
                    <Badge variant={c.type === "customer" ? "default" : "secondary"}>{c.type}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{c.phone || "No phone"}</span>
                    <span className={`font-bold ${Number(c.current_balance) > 0 ? "text-destructive" : "text-green-600"}`}>
                      Rs {Number(c.current_balance).toLocaleString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between flex-wrap gap-2">
              <span>Ledger — {selectedContact?.name}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="default" className="gap-2" onClick={() => { resetForm(); setShowAddForm(true); }}>
                  <Plus className="h-4 w-4" /> Add Entry
                </Button>
                <Button size="sm" variant="outline" className="gap-2" onClick={handleExportExcel}><Download className="h-4 w-4" /> Excel</Button>
                
              </div>
            </DialogTitle>
          </DialogHeader>

          {/* Add/Edit Entry Form */}
          {showAddForm && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="rounded-lg border bg-muted/30 p-4 mb-4">
              <h3 className="text-sm font-semibold mb-3">{editingEntry ? "Edit Ledger Entry" : "Add Ledger Entry"}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Date</Label>
                  <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Type</Label>
                  <Select value={entryType} onValueChange={setEntryType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sale">Sale (Credit)</SelectItem>
                      <SelectItem value="payment">Payment (Debit)</SelectItem>
                      <SelectItem value="opening">Opening Balance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Description</Label>
                  <Input placeholder="e.g. Invoice F1234, Cash Deposit..." value={entryDesc} onChange={(e) => setEntryDesc(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Debit (Payment received)</Label>
                  <Input type="number" min={0} value={entryDebit || ""} onChange={(e) => setEntryDebit(Number(e.target.value) || 0)} placeholder="0" />
                </div>
                <div>
                  <Label className="text-xs">Credit (Sale amount)</Label>
                  <Input type="number" min={0} value={entryCredit || ""} onChange={(e) => setEntryCredit(Number(e.target.value) || 0)} placeholder="0" />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={handleSaveEntry} disabled={saving}>
                  {saving ? "Saving..." : editingEntry ? "Update" : "Add Entry"}
                </Button>
                <Button size="sm" variant="ghost" onClick={resetForm}>Cancel</Button>
              </div>
            </motion.div>
          )}

          {ledgerLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading ledger...</div>
          ) : (
            <>
              <div className="flex gap-4 mb-4">
                <Card className="flex-1 px-4 py-2">
                  <p className="text-xs text-muted-foreground">Total Debit</p>
                  <p className="text-lg font-bold">Rs {totalDebit.toLocaleString()}</p>
                </Card>
                <Card className="flex-1 px-4 py-2">
                  <p className="text-xs text-muted-foreground">Total Credit</p>
                  <p className="text-lg font-bold">Rs {totalCredit.toLocaleString()}</p>
                </Card>
                <Card className="flex-1 px-4 py-2">
                  <p className="text-xs text-muted-foreground">Balance</p>
                  <p className={`text-lg font-bold ${ledger.length > 0 && ledger[ledger.length - 1].balance > 0 ? "text-destructive" : "text-green-600"}`}>
                    Rs {ledger.length > 0 ? ledger[ledger.length - 1].balance.toLocaleString() : "0"}
                  </p>
                </Card>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Date</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Type</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Description</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Debit</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Credit</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Balance</th>
                      <th className="px-3 py-2 text-center font-medium text-muted-foreground w-20">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((e, i) => (
                      <tr key={e.id || i} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-3 py-2">{e.date}</td>
                        <td className="px-3 py-2"><Badge variant="outline">{e.type}</Badge></td>
                        <td className="px-3 py-2">{e.description}</td>
                        <td className="px-3 py-2 text-right">{e.debit ? `Rs ${e.debit.toLocaleString()}` : "—"}</td>
                        <td className="px-3 py-2 text-right">{e.credit ? `Rs ${e.credit.toLocaleString()}` : "—"}</td>
                        <td className={`px-3 py-2 text-right font-medium ${e.balance > 0 ? "text-destructive" : ""}`}>Rs {e.balance.toLocaleString()}</td>
                        <td className="px-3 py-2 text-center">
                          {e.id && (
                            <div className="flex gap-1 justify-center">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEditEntry(e)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeleteEntry(e)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
