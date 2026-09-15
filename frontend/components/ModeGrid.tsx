/* One card per mode: the last 365 days as a sparkline, the 28-day average,
   and the change against the same window a year earlier. Sign and weight
   carry direction; there is no red or green. */

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
  const retired = mode.status === "retired";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} role="img" aria-label={`${mode.label}, daily trips, ${dateName(pts[0].date)} to ${dateName(pts[pts.length - 1].date)}`}>
      <path d={area} fill={retired ? "var(--color-ash-mist)" : "#5a769f"} opacity={retired ? 0.12 : 0.16} />
      <path d={d} fill="none" stroke={retired ? "var(--color-ash-mist)" : "var(--color-onyx)"} strokeWidth={1.25} strokeLinejoin="round" />
    </svg>
  );
}

export default function ModeGrid() {
  const ordered = [...modes].sort((a, b) => (b.last_28d_avg ?? 0) - (a.last_28d_avg ?? 0));
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ordered.map((m) => (
        <article key={m.key} className="card" style={{ padding: 24 }}>
          <div className="flex items-baseline justify-between gap-3">
            <h3 style={{ fontSize: 20, lineHeight: 1.2, letterSpacing: "-0.2px", fontWeight: 500 }}>{m.label}</h3>
            {m.status === "retired" ? <span className="status status-warn">Retired</span> : m.status === "new" ? <span className="status status-ok">New</span> : <span className="caption muted">{m.operator}</span>}
          </div>
          <div style={{ marginTop: 14 }}>
            <Spark mode={m} />
          </div>
          <dl className="flex items-baseline justify-between" style={{ marginTop: 12 }}>
            <div>
              <dt className="caption muted">28-day average</dt>
              <dd className="tabular" style={{ fontSize: 24, lineHeight: 1.15, letterSpacing: "-0.24px", fontWeight: 400, marginTop: 4 }}>
                {m.status === "retired" ? "—" : num(m.last_28d_avg)}
              </dd>
            </div>
            <div className="text-right">
              <dt className="caption muted">vs a year ago</dt>
              <dd className="tabular" style={{ fontSize: 16, fontWeight: m.yoy != null && Math.abs(m.yoy) >= 0.1 ? 570 : 400, marginTop: 4, color: m.yoy == null ? "var(--text-muted)" : "var(--text-primary)" }}>
                {m.status === "retired" ? "—" : m.yoy == null ? "no baseline" : pct(m.yoy)}
              </dd>
            </div>
          </dl>
          {m.note && (
            <p className="caption" style={{ color: "var(--text-secondary)", marginTop: 12, lineHeight: 1.4 }}>
              {m.note}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
