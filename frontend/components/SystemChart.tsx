/* Monthly trips since 2019, rail and bus as two lines. Whole months only, so
   the newest partial month never reads as a collapse. Monochrome marks; the
   dawn arc's steel blue sits under the rail line as atmosphere, not as a
   category colour. Server component, drawn from the mart at build time. */

import { monthly, compact, monthName } from "@/lib/data";

const W = 960;
const H = 320;
const PAD = { top: 20, right: 24, bottom: 36, left: 56 };
const PW = W - PAD.left - PAD.right;
const PH = H - PAD.top - PAD.bottom;

export default function SystemChart() {
  const months = Array.from(new Set(monthly.map((m) => m.month))).sort();
  const series = {
    rail: months.map((mo) => monthly.filter((r) => r.month === mo && r.system === "rail").reduce((s, r) => s + r.trips, 0)),
    bus: months.map((mo) => monthly.filter((r) => r.month === mo && r.system === "bus").reduce((s, r) => s + r.trips, 0)),
  };
  // Bus reporting starts in 2022; earlier months are absent, not zero.
  const busStart = months.findIndex((_, i) => series.bus[i] > 0);
  const max = Math.max(...series.rail, ...series.bus);
  const step = max > 30e6 ? 10e6 : max > 12e6 ? 5e6 : 2e6;
  const top = Math.ceil(max / step) * step;
  const x = (i: number) => PAD.left + (i / (months.length - 1)) * PW;
  const y = (v: number) => PAD.top + (1 - v / top) * PH;
  const path = (vals: number[], from = 0) => vals.map((v, i) => (i < from ? null : `${i === from ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)).filter(Boolean).join(" ");
  const years = months.map((m, i) => ({ m, i })).filter(({ m }) => m.endsWith("-01"));
  const ticks = Array.from({ length: top / step + 1 }, (_, k) => k * step);
  const last = months.length - 1;
  const railArea = `${path(series.rail)} L${x(last).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`;

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Monthly trips by system, ${monthName(months[0])} to ${monthName(months[last])}`}>
        <defs>
          <linearGradient id="dawn-wash" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5a769f" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#c1d3e6" stopOpacity={0} />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--hairline)" />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)" className="tabular">
              {t === 0 ? "0" : compact(t)}
            </text>
          </g>
        ))}
        {years.map(({ m, i }) => (
          <text key={m} x={x(i)} y={H - 10} textAnchor="middle" fontSize={11} fill="var(--text-muted)">
            {m.slice(0, 4)}
          </text>
        ))}
        <path d={railArea} fill="url(#dawn-wash)" />
        <path d={path(series.rail)} fill="none" stroke="var(--color-onyx)" strokeWidth={1.75} strokeLinejoin="round" />
        <path d={path(series.bus, busStart)} fill="none" stroke="var(--color-slate-veil)" strokeWidth={1.5} strokeDasharray="4 3" strokeLinejoin="round" />
        <circle cx={x(last)} cy={y(series.rail[last])} r={3.5} fill="var(--color-onyx)" />
        <circle cx={x(last)} cy={y(series.bus[last])} r={3.5} fill="var(--color-slate-veil)" />
      </svg>
      <figcaption className="body-sm flex flex-wrap items-center gap-x-6 gap-y-1" style={{ marginTop: 12, color: "var(--text-secondary)" }}>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" style={{ width: 18, height: 0, borderTop: "1.75px solid var(--color-onyx)" }} /> Rail (Rapid Rail + KTMB)
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" style={{ width: 18, height: 0, borderTop: "1.5px dashed var(--color-slate-veil)" }} /> Bus (Rapid Bus, reported from 2022)
        </span>
        <span className="muted">Whole months only · trips, not passengers</span>
      </figcaption>
    </figure>
  );
}
