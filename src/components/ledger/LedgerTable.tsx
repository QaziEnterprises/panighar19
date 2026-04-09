import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";

interface LedgerEntry {
  id?: string;
  date: string; type: string; ref: string; description: string;
  debit: number; credit: number; balance: number;
}

interface LedgerTableProps {
  entries: LedgerEntry[];
  onEdit: (entry: LedgerEntry) => void;
  onDelete: (entry: LedgerEntry) => void;
}

export default function LedgerTable({ entries, onEdit, onDelete }: LedgerTableProps) {
  return (
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
          {entries.length === 0 ? (
            <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No entries found</td></tr>
          ) : entries.map((e, i) => (
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
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(e)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDelete(e)}>
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
  );
}
