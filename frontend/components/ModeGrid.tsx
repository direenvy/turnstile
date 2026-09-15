/* One card per mode: the last 365 days as a sparkline, the 28-day average,
   and the change against the same window a year earlier. */

import { daily, modes, num, pct, dateName, type Mode } from "@/lib/data";

const W = 280;
const H = 64;

function Spark({ mode }: { mode: Mode }) {
  const pts = daily.filter((d) => d.mode === mode.key);
  if (pts.length < 2) return <div style={{ height: H }} />;
  const max = Math.max(...pts.map((p) => p.trips));
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (v: number) => H - 4 - (v / (max || 1)) * (H - 8);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.trips).toFixed(1)}`).join(" ");
  const area = `${d} L${W} ${H} L0 ${H} Z`;
  const colour = mode.status === "retired" ? "var(--text-faint)" : "var(--data)";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} role="img" aria-label={`${mode.label}, daily trips, ${dateName(pts[0].date)} to ${dateName(pts[pts.length - 1].date)}`}>
      <path d={area} fill={colour} opacity={0.1} />
      <path d={d} fill="none" stroke={colour} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

const STATUS: Record<Mode["status"], string> = { active: "", new: "New", retired: "Retired" };

export default function ModeGrid() {
  const ordered = [...modes].sort((a, b) => (b.last_28d_avg ?? 0) - (a.last_28d_avg ?? 0));
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ordered.map((m) => (
        <article key={m.key} className="card" style={{ padding: 20 }}>
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="subheading-sm" style={{ fontSize: 17 }}>
              {m.label}
            </h3>
            <span style={{ fontSize: 12, color: m.status === "retired" ? "var(--accent)" : "var(--text-label)", fontWeight: 500, whiteSpace: "nowrap" }}>
              {STATUS[m.status] || m.operator}
            </span>
          </div>
          <div style={{ marginTop: 12 }}>
            <Spark mode={m} />
          </div>
          <dl className="flex items-baseline justify-between" style={{ marginTop: 10 }}>
            <div>
              <dt style={{ fontSize: 11, color: "var(--text-label)" }}>28-day average</dt>
              <dd className="tabular" style={{ fontSize: 20, fontWeight: 500, color: "var(--text-heading)" }}>
                {m.status === "retired" ? "—" : num(m.last_28d_avg)}
              </dd>
            </div>
            <div className="text-right">
              <dt style={{ fontSize: 11, color: "var(--text-label)" }}>vs a year ago</dt>
              <dd className="tabular" style={{ fontSize: 15, fontWeight: 500, color: m.yoy == null ? "var(--text-label)" : m.yoy < 0 ? "var(--accent)" : "var(--data)" }}>
                {m.status === "retired" ? "—" : m.yoy == null ? "no baseline" : pct(m.yoy)}
              </dd>
            </div>
          </dl>
          {m.note && (
            <p style={{ fontSize: 12, color: "var(--text-label)", marginTop: 10, lineHeight: 1.4 }}>
              {m.note}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
