import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { TrendPoint } from "../lib/types";

interface TrendChartProps {
  timeline: TrendPoint[];
}

/** Line chart of a single keyword's Google Trends interest-over-time. */
export function TrendChart({ timeline }: TrendChartProps) {
  if (timeline.length === 0) {
    return <p className="text-sm text-slate-500">Sin datos aún — corre la recolección.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={timeline}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Line type="monotone" dataKey="value" stroke="#1e293b" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
