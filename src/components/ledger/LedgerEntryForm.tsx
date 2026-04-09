import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface LedgerEntryFormProps {
  editingEntry: any;
  entryDate: string; setEntryDate: (v: string) => void;
  entryDesc: string; setEntryDesc: (v: string) => void;
  entryDebit: number; setEntryDebit: (v: number) => void;
  entryCredit: number; setEntryCredit: (v: number) => void;
  entryType: string; setEntryType: (v: string) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export default function LedgerEntryForm({
  editingEntry, entryDate, setEntryDate, entryDesc, setEntryDesc,
  entryDebit, setEntryDebit, entryCredit, setEntryCredit,
  entryType, setEntryType, saving, onSave, onCancel,
}: LedgerEntryFormProps) {
  return (
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
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? "Saving..." : editingEntry ? "Update" : "Add Entry"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </motion.div>
  );
}
