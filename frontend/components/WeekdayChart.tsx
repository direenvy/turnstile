/* Average daily trips by weekday over the last 52 weeks, rail and bus.
   This is the shape the outlier rule has to respect: a same-weekday baseline
   exists because Saturday is not a broken Friday. Server component. */

import { modes, weekday, num } from "@/lib/data";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// DuckDB dayofweek: 0 = Sunday … 6 = Saturday. Reorder to Monday-first.
const ORDER = [1, 2, 3, 4, 5, 6, 0];

const W = 960;
const H = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 56 };
const PW = W - PAD.left - PAD.right;
const PH = H - PAD.top - PAD.bottom;

export default function WeekdayChart() {
  const system = (name: string) => {
    const keys = new Set(modes.filter((m) => m.system === name && m.status !== "retired").map((m) => m.key));
    return ORDER.map((d) => weekday.filter((w) => keys.has(w.mode) && w.weekday === d).reduce((s, w) => s + w.trips, 0));
  };
  const rail = system("rail");
  const bus = system("bus");
  const max = Math.max(...rail, ...bus);
  const step = max > 1.5e6 ? 500e3 : max > 600e3 ? 200e3 : 100e3;
  const top = Math.ceil(max / step) * step;
  const y = (v: number) => PAD.top + (1 - v / top) * PH;
  const group = PW / 7;
  const bar = group * 0.28;
  const ticks = Array.from({ length: top / step + 1 }, (_, k) => k * step);

  const weekdayAvg = (vals: number[]) => vals.slice(0, 5).reduce((s, v) => s + v, 0) / 5;
  const railSat = rail[5] / weekdayAvg(rail);
  const railSun = rail[6] / weekdayAvg(rail);
  const busSat = bus[5] / weekdayAvg(bus);

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Average daily trips by weekday, rail and bus, last 52 weeks">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--hairline)" />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)" className="tabular">
              {t === 0 ? "0" : t >= 1e6 ? `${(t / 1e6).toFixed(1)}M` : `${Math.round(t / 1e3)}k`}
            </text>
          </g>
        ))}
        {DAYS.map((d, i) => {
          const cx = PAD.left + group * (i + 0.5);
          return (
            <g key={d}>
              <rect x={cx - bar - 2} y={y(rail[i])} width={bar} height={y(0) - y(rail[i])} fill="var(--color-onyx)" rx={3} />
              <rect x={cx + 2} y={y(bus[i])} width={bar} height={y(0) - y(bus[i])} fill="var(--color-slate-veil)" opacity={0.7} rx={3} />
              <text x={cx} y={H - 8} textAnchor="middle" fontSize={11} fill={i >= 5 ? "var(--color-onyx)" : "var(--text-muted)"} fontWeight={i >= 5 ? 500 : 400}>
                {d}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="body-sm flex flex-wrap items-center gap-x-6 gap-y-1" style={{ marginTop: 12, color: "var(--text-secondary)" }}>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: "var(--color-onyx)" }} /> Rail
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: "var(--color-slate-veil)", opacity: 0.7 }} /> Bus
        </span>
        <span className="tabular">
          Rail runs at {Math.round(railSat * 100)}% of a weekday on Saturday and {Math.round(railSun * 100)}% on Sunday; bus at {Math.round(busSat * 100)}% on Saturday. Weekday rail average {num(weekdayAvg(rail))} trips.
        </span>
      </figcaption>
    </figure>
  );
}
