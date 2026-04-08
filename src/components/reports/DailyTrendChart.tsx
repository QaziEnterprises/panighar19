import { useMemo } from "react";
import { BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from "recharts";

interface DailySummary {
  date: string;
  totalSales: number;
  totalPurchases: number;
  totalExpenses: number;
  profit: number;
}

export default function DailyTrendChart({ data }: { data: DailySummary[] }) {
  const chartData = useMemo(
    () =>
      [...data]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({
          date: d.date.slice(5), // MM-DD
          Sales: d.totalSales,
          Purchases: d.totalPurchases,
          Expenses: d.totalExpenses,
          Profit: d.profit,
        })),
    [data]
  );

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
        <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            color: "hsl(var(--popover-foreground))",
            fontSize: 12,
          }}
          formatter={(value: number) => `Rs ${value.toLocaleString()}`}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Sales" fill="hsl(var(--chart-3))" radius={[3, 3, 0, 0]} opacity={0.85} />
        <Bar dataKey="Purchases" fill="hsl(var(--info))" radius={[3, 3, 0, 0]} opacity={0.85} />
        <Bar dataKey="Expenses" fill="hsl(var(--chart-4))" radius={[3, 3, 0, 0]} opacity={0.85} />
        <Line type="monotone" dataKey="Profit" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
