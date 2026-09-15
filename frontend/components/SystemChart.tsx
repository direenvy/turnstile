"use client";

/* Monthly trips since 2019, rail and bus as two lines, with a range control.
   One path holds the whole history; changing the range animates an affine
   transform on it, so the chart glides to the new window instead of
   redrawing. Whole months only, so the newest partial month never reads as a
   collapse. Monochrome marks; the dawn arc's steel blue sits under the rail
   line as atmosphere, not as a category colour. */

import { useMemo, useState, type MouseEvent } from "react";
import { monthly, compact, monthName, num } from "@/lib/data";

const W = 960;
const H = 320;
const PAD = { top: 20, right: 24, bottom: 36, left: 56 };
const PW = W - PAD.left - PAD.right;
const PH = H - PAD.top - PAD.bottom;
const EASE = "700ms cubic-bezier(0.2, 0.7, 0.2, 1)";

const RANGES = [
  { key: "all", label: "Since 2019", months: Infinity },
  { key: "5y", label: "5 years", months: 60 },
  { key: "3y", label: "3 years", months: 36 },
  { key: "1y", label: "12 months", months: 12 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

export default function SystemChart() {
  const [range, setRange] = useState<RangeKey>("all");
  const [hover, setHover] = useState<number | null>(null);

  const { months, rail, bus, busStart, topAll } = useMemo(() => {
    const months = Array.from(new Set(monthly.map((m) => m.month))).sort();
    const sum = (mo: string, system: string) => monthly.filter((r) => r.month === mo && r.system === system).reduce((s, r) => s + r.trips, 0);
    const rail = months.map((mo) => sum(mo, "rail"));
    const bus = months.map((mo) => sum(mo, "bus"));
    // Bus reporting starts in 2022; earlier months are absent, not zero.
    const busStart = bus.findIndex((v) => v > 0);
    return { months, rail, bus, busStart, topAll: Math.max(...rail, ...bus) };
  }, []);

  const N = months.length;
  const last = N - 1;
  const wanted = RANGES.find((r) => r.key === range)!.months;
  const start = Number.isFinite(wanted) ? Math.max(0, N - wanted) : 0;

  // Base coordinates map the whole history onto the plot; the window is an
  // affine transform of them, which is what the CSS transition animates.
  const x = (i: number) => PAD.left + (i / last) * PW;
  const y = (v: number) => PAD.top + (1 - v / topAll) * PH;
  const windowMax = Math.max(...rail.slice(start), ...bus.slice(start));
  const step = windowMax > 30e6 ? 10e6 : windowMax > 12e6 ? 5e6 : windowMax > 6e6 ? 2e6 : 1e6;
  const topW = Math.ceil(windowMax / step) * step;
  const sx = last / (last - start);
  const sy = topAll / topW;
  const tx = PAD.left - sx * x(start);
  const ty = (PAD.top + PH) * (1 - sy);
  const matrix = `matrix(${sx}, 0, 0, ${sy}, ${tx}, ${ty})`;
  // The same mapping, for things drawn outside the transformed group.
  const xw = (i: number) => sx * x(i) + tx;
  const yw = (v: number) => sy * y(v) + ty;

  const path = (vals: number[], from = 0) => vals.map((v, i) => (i < from ? null : `${i === from ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)).filter(Boolean).join(" ");
  const railArea = `${path(rail)} L${x(last).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`;

  const ticks = Array.from({ length: topW / step + 1 }, (_, k) => k * step);
  const span = last - start;
  const yearLabels = months
    .map((m, i) => ({ m, i }))
    .filter(({ m, i }) => i >= start && (span > 24 ? m.endsWith("-01") : (i - start) % (span > 12 ? 3 : 1) === 0));
  const label = (m: string) => (span > 24 ? m.slice(0, 4) : new Date(`${m}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: span > 12 ? "2-digit" : undefined }));

  function onMove(e: MouseEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(start + ((px - PAD.left) / PW) * span);
    setHover(Math.min(last, Math.max(start, i)));
  }

  return (
    <figure>
      <div className="flex flex-wrap items-center justify-between gap-3" style={{ marginBottom: 16 }}>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={r.key === range}
              onClick={() => setRange(r.key)}
              className="pill"
              style={{ fontSize: 14, padding: "8px 14px", background: r.key === range ? "var(--color-onyx)" : undefined, color: r.key === range ? "var(--color-parchment-canvas)" : "var(--text-secondary)" }}
            >
              {r.label}
            </button>
          ))}
        </div>
        <span className="body-sm tabular secondary" aria-live="polite">
          {monthName(months[start])} – {monthName(months[last])}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Monthly trips by system, ${monthName(months[start])} to ${monthName(months[last])}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="dawn-wash" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5a769f" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#c1d3e6" stopOpacity={0} />
          </linearGradient>
          <clipPath id="plot">
            <rect x={PAD.left} y={0} width={PW} height={PAD.top + PH} />
          </clipPath>
        </defs>

        {ticks.map((t) => (
          <g key={`${range}-${t}`} style={{ animation: "chart-fade 500ms ease both" }}>
            <line x1={PAD.left} x2={W - PAD.right} y1={yw(t)} y2={yw(t)} stroke="var(--hairline)" />
            <text x={PAD.left - 8} y={yw(t) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)" className="tabular">
              {t === 0 ? "0" : compact(t)}
            </text>
          </g>
        ))}
        {yearLabels.map(({ m, i }) => (
          <text key={`${range}-${m}`} x={xw(i)} y={H - 10} textAnchor="middle" fontSize={11} fill="var(--text-muted)" style={{ animation: "chart-fade 500ms ease both" }}>
            {label(m)}
          </text>
        ))}

        <g clipPath="url(#plot)">
          <g style={{ transform: matrix, transition: `transform ${EASE}` }}>
            <path d={railArea} fill="url(#dawn-wash)" />
            <path d={path(rail)} fill="none" stroke="var(--color-onyx)" strokeWidth={1.75} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <path d={path(bus, busStart)} fill="none" stroke="var(--color-slate-veil)" strokeWidth={1.5} strokeDasharray="4 3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </g>
        </g>
        <circle r={3.5} fill="var(--color-onyx)" style={{ transform: `translate(${xw(last)}px, ${yw(rail[last])}px)`, transition: `transform ${EASE}` }} />
        <circle r={3.5} fill="var(--color-slate-veil)" style={{ transform: `translate(${xw(last)}px, ${yw(bus[last])}px)`, transition: `transform ${EASE}` }} />

        {hover !== null && (
          <g pointerEvents="none">
            <line x1={xw(hover)} x2={xw(hover)} y1={PAD.top} y2={PAD.top + PH} stroke="var(--color-ash-mist)" strokeDasharray="2 3" />
            <circle cx={xw(hover)} cy={yw(rail[hover])} r={3} fill="var(--color-parchment-canvas)" stroke="var(--color-onyx)" strokeWidth={1.5} />
            {hover >= busStart && <circle cx={xw(hover)} cy={yw(bus[hover])} r={3} fill="var(--color-parchment-canvas)" stroke="var(--color-slate-veil)" strokeWidth={1.5} />}
            <g transform={`translate(${Math.min(xw(hover) + 12, W - PAD.right - 176)}, ${PAD.top + 4})`}>
              <rect width={170} height={hover >= busStart ? 58 : 42} rx={8} fill="var(--color-parchment-canvas)" stroke="var(--hairline)" />
              <text x={12} y={18} fontSize={11} fill="var(--text-secondary)">
                {monthName(months[hover])}
              </text>
              <text x={12} y={34} fontSize={12} fill="var(--color-onyx)" className="tabular">
                Rail {num(rail[hover])}
              </text>
              {hover >= busStart && (
                <text x={12} y={50} fontSize={12} fill="var(--color-slate-veil)" className="tabular">
                  Bus {num(bus[hover])}
                </text>
              )}
            </g>
          </g>
        )}
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
