/* Monthly trips since 2019, rail and bus as two lines. Whole months only, so
   the newest partial month never reads as a collapse. Server component; the
   SVG is drawn from the mart at build time. */

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

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Monthly trips by system, ${monthName(months[0])} to ${monthName(months[last])}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border-hairline)" />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--text-label)" className="tabular">
              {t === 0 ? "0" : compact(t)}
            </text>
          </g>
        ))}
        {years.map(({ m, i }) => (
          <text key={m} x={x(i)} y={H - 10} textAnchor="middle" fontSize={11} fill="var(--text-label)">
            {m.slice(0, 4)}
          </text>
        ))}
        <path d={path(series.rail)} fill="none" stroke="var(--data)" strokeWidth={2} strokeLinejoin="round" />
        <path d={path(series.bus, busStart)} fill="none" stroke="var(--color-indigo-navy)" strokeWidth={2} strokeLinejoin="round" />
        <circle cx={x(last)} cy={y(series.rail[last])} r={3.5} fill="var(--data)" />
        <circle cx={x(last)} cy={y(series.bus[last])} r={3.5} fill="var(--color-indigo-navy)" />
      </svg>
      <figcaption className="flex flex-wrap items-center gap-x-6 gap-y-1" style={{ marginTop: 12, fontSize: 13, color: "var(--text-body)" }}>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" style={{ width: 16, height: 2, background: "var(--data)" }} /> Rail (Rapid Rail + KTMB)
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" style={{ width: 16, height: 2, background: "var(--color-indigo-navy)" }} /> Bus (Rapid Bus, reported from 2022)
        </span>
        <span style={{ color: "var(--text-label)" }}>Whole months only · trips, not passengers</span>
      </figcaption>
    </figure>
  );
}
