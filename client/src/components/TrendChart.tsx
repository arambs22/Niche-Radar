import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { TrendPoint } from "../lib/types";

interface TrendChartProps {
  timeline: TrendPoint[];
}

const TICK_STYLE = { fontSize: 12, fontFamily: '"IBM Plex Mono", monospace', fill: "var(--color-text-muted)" };

/** Line chart of a single keyword's Google Trends interest-over-time. */
export function TrendChart({ timeline }: TrendChartProps) {
  if (timeline.length === 0) {
    return <p className="text-sm text-text-muted">Sin datos aún — corre la recolección.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={timeline}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="date" tick={TICK_STYLE} />
        <YAxis tick={TICK_STYLE} />
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--color-surface)",
            borderColor: "var(--color-border)",
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 12,
          }}
          labelStyle={{ color: "var(--color-text)" }}
        />
        <Line type="monotone" dataKey="value" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
