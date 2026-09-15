"use client";

/* Monthly trips since 2019 — by system (rail vs bus) or up to three modes
   side by side — with a range control. One path per series holds the whole
   history; changing the range animates an affine transform on the group, so
   the chart glides to the new window instead of redrawing. Whole months only.
   Monochrome marks: series are told apart by line style, not hue; the dawn
   arc's steel blue sits under the first series as atmosphere. */

import { useMemo, useState, type MouseEvent } from "react";
import { modes, monthly, compact, monthName, num } from "@/lib/data";

const W = 960;
const H = 320;
const PAD = { top: 20, right: 24, bottom: 36, left: 56 };
const PW = W - PAD.left - PAD.right;
const PH = H - PAD.top - PAD.bottom;
const EASE = "700ms cubic-bezier(0.2, 0.7, 0.2, 1)";
const MAX_MODES = 3;

const RANGES = [
  { key: "all", label: "Since 2019", months: Infinity },
  { key: "5y", label: "5 years", months: 60 },
  { key: "3y", label: "3 years", months: 36 },
  { key: "1y", label: "12 months", months: 12 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

// Three line styles, all monochrome: the eye separates them by texture.
const STYLES = [
  { stroke: "var(--color-onyx)", width: 1.75, dash: undefined, css: "1.75px solid var(--color-onyx)" },
  { stroke: "var(--color-slate-veil)", width: 1.5, dash: "4 3", css: "1.5px dashed var(--color-slate-veil)" },
  { stroke: "var(--color-onyx)", width: 1.5, dash: "1.5 3.5", css: "1.5px dotted var(--color-onyx)" },
];

type Series = { key: string; label: string; values: (number | null)[] };

export default function SystemChart() {
  const [range, setRange] = useState<RangeKey>("all");
  const [view, setView] = useState<"system" | "modes">("system");
  const [picked, setPicked] = useState<string[]>(() =>
    [...modes]
      .filter((m) => m.status !== "retired")
      .sort((a, b) => (b.last_28d_avg ?? 0) - (a.last_28d_avg ?? 0))
      .slice(0, MAX_MODES)
      .map((m) => m.key),
  );
  const [hover, setHover] = useState<number | null>(null);

  const months = useMemo(() => Array.from(new Set(monthly.map((m) => m.month))).sort(), []);
  const byMonth = useMemo(() => {
    const idx = new Map<string, number>(months.map((m, i) => [m, i]));
    const table = new Map<string, (number | null)[]>();
    for (const r of monthly) {
      const key = r.mode;
      if (!table.has(key)) table.set(key, Array(months.length).fill(null));
      table.get(key)![idx.get(r.month)!] = r.trips;
    }
    return table;
  }, [months]);

  const series: Series[] = useMemo(() => {
    if (view === "system") {
      const sum = (system: string) =>
        months.map((_, i) => {
          const vals = modes.filter((m) => m.system === system).map((m) => byMonth.get(m.key)?.[i] ?? null);
          return vals.some((v) => v !== null) ? vals.reduce<number>((s, v) => s + (v ?? 0), 0) : null;
        });
      return [
        { key: "rail", label: "Rail (Rapid Rail + KTMB)", values: sum("rail") },
        { key: "bus", label: "Bus (Rapid Bus, reported from 2022)", values: sum("bus") },
      ];
    }
    return picked.map((k) => ({ key: k, label: modes.find((m) => m.key === k)!.label, values: byMonth.get(k) ?? [] }));
  }, [view, picked, months, byMonth]);

  const N = months.length;
  const last = N - 1;
  const wanted = RANGES.find((r) => r.key === range)!.months;
  const start = Number.isFinite(wanted) ? Math.max(0, N - wanted) : 0;

  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const topAll = Math.max(1, ...all);
  const x = (i: number) => PAD.left + (i / last) * PW;
  const y = (v: number) => PAD.top + (1 - v / topAll) * PH;
  const windowMax = Math.max(1, ...series.flatMap((s) => s.values.slice(start).filter((v): v is number => v !== null)));
  const step = windowMax > 30e6 ? 10e6 : windowMax > 12e6 ? 5e6 : windowMax > 6e6 ? 2e6 : windowMax > 2.5e6 ? 1e6 : windowMax > 1e6 ? 500e3 : windowMax > 250e3 ? 100e3 : 50e3;
  const topW = Math.ceil(windowMax / step) * step;
  const sx = last / (last - start);
  const sy = topAll / topW;
  const tx = PAD.left - sx * x(start);
  const ty = (PAD.top + PH) * (1 - sy);
  const matrix = `matrix(${sx}, 0, 0, ${sy}, ${tx}, ${ty})`;
  const xw = (i: number) => sx * x(i) + tx;
  const yw = (v: number) => sy * y(v) + ty;

  // A series may begin late (a line that opened) — draw segments, not one path.
  const path = (vals: (number | null)[]) => {
    let d = "";
    let open = false;
    vals.forEach((v, i) => {
      if (v === null) {
        open = false;
        return;
      }
      d += `${open ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      open = true;
    });
    return d.trim();
  };
  const first = series[0];
  const firstStart = first.values.findIndex((v) => v !== null);
  const firstEnd = first.values.length - 1 - [...first.values].reverse().findIndex((v) => v !== null);
  const area = firstStart >= 0 ? `${path(first.values)} L${x(firstEnd).toFixed(1)} ${y(0)} L${x(firstStart).toFixed(1)} ${y(0)} Z` : "";

  const ticks = Array.from({ length: topW / step + 1 }, (_, k) => k * step);
  const span = last - start;
  const yearLabels = months.map((m, i) => ({ m, i })).filter(({ m, i }) => i >= start && (span > 24 ? m.endsWith("-01") : (i - start) % (span > 12 ? 3 : 1) === 0));
  const label = (m: string) => (span > 24 ? m.slice(0, 4) : new Date(`${m}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: span > 12 ? "2-digit" : undefined }));

  function onMove(e: MouseEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(start + ((px - PAD.left) / PW) * span);
    setHover(Math.min(last, Math.max(start, i)));
  }

  function togglePick(key: string) {
    setPicked((p) => (p.includes(key) ? (p.length > 1 ? p.filter((k) => k !== key) : p) : [...p.slice(-(MAX_MODES - 1)), key]));
  }

  const pillStyle = (active: boolean) => ({
    fontSize: 14,
    padding: "8px 14px",
    background: active ? "var(--color-onyx)" : undefined,
    color: active ? "var(--color-parchment-canvas)" : "var(--text-secondary)",
  });

  return (
    <figure>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Range">
          {RANGES.map((r) => (
            <button key={r.key} type="button" aria-pressed={r.key === range} onClick={() => setRange(r.key)} className="pill" style={pillStyle(r.key === range)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Series">
          <button type="button" aria-pressed={view === "system"} onClick={() => setView("system")} className="pill" style={pillStyle(view === "system")}>
            By system
          </button>
          <button type="button" aria-pressed={view === "modes"} onClick={() => setView("modes")} className="pill" style={pillStyle(view === "modes")}>
            Compare modes
          </button>
        </div>
      </div>

      {view === "modes" && (
        <div className="flex flex-wrap gap-1" role="group" aria-label={`Pick up to ${MAX_MODES} modes`} style={{ marginTop: 12 }}>
          {modes.map((m) => {
            const on = picked.includes(m.key);
            return (
              <button key={m.key} type="button" aria-pressed={on} onClick={() => togglePick(m.key)} className={`pill ${on ? "" : "outlined"}`} style={{ ...pillStyle(on), fontSize: 13, padding: "6px 12px", fontWeight: 400 }}>
                {m.label}
              </button>
            );
          })}
        </div>
      )}

      <p className="body-sm tabular secondary" aria-live="polite" style={{ marginTop: 12, marginBottom: 12 }}>
        {monthName(months[start])} – {monthName(months[last])}
      </p>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Monthly trips, ${series.map((s) => s.label).join(" and ")}, ${monthName(months[start])} to ${monthName(months[last])}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
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
          <g key={`${range}-${view}-${t}`} style={{ animation: "chart-fade 500ms ease both" }}>
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

        {/* Keyed on the series set: a new set remounts without a transition; a range change glides. */}
        <g clipPath="url(#plot)" key={series.map((s) => s.key).join("+")}>
          <g style={{ transform: matrix, transition: `transform ${EASE}` }}>
            <path d={area} fill="url(#dawn-wash)" />
            {series.map((s, k) => (
              <path key={s.key} d={path(s.values)} fill="none" stroke={STYLES[k].stroke} strokeWidth={STYLES[k].width} strokeDasharray={STYLES[k].dash} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            ))}
          </g>
        </g>
        {series.map((s, k) => {
          const v = s.values[last];
          return v === null ? null : <circle key={s.key} r={3.5} fill={STYLES[k].stroke} style={{ transform: `translate(${xw(last)}px, ${yw(v)}px)`, transition: `transform ${EASE}` }} />;
        })}

        {hover !== null && (
          <g pointerEvents="none">
            <line x1={xw(hover)} x2={xw(hover)} y1={PAD.top} y2={PAD.top + PH} stroke="var(--color-ash-mist)" strokeDasharray="2 3" />
            {series.map((s, k) => {
              const v = s.values[hover];
              return v === null ? null : <circle key={s.key} cx={xw(hover)} cy={yw(v)} r={3} fill="var(--color-parchment-canvas)" stroke={STYLES[k].stroke} strokeWidth={1.5} />;
            })}
            <g transform={`translate(${Math.min(xw(hover) + 12, W - PAD.right - 216)}, ${PAD.top + 4})`}>
              <rect width={210} height={26 + 16 * series.length} rx={8} fill="var(--color-parchment-canvas)" stroke="var(--hairline)" />
              <text x={12} y={18} fontSize={11} fill="var(--text-secondary)">
                {monthName(months[hover])}
              </text>
              {series.map((s, k) => (
                <text key={s.key} x={12} y={34 + 16 * k} fontSize={12} fill={STYLES[k].stroke} className="tabular">
                  {s.label.split(" (")[0]} {s.values[hover] === null ? "—" : num(s.values[hover])}
                </text>
              ))}
            </g>
          </g>
        )}
      </svg>

      <figcaption className="body-sm flex flex-wrap items-center gap-x-6 gap-y-1" style={{ marginTop: 12, color: "var(--text-secondary)" }}>
        {series.map((s, k) => (
          <span key={s.key} className="flex items-center gap-2">
            <span aria-hidden="true" style={{ width: 18, height: 0, borderTop: STYLES[k].css }} /> {s.label}
          </span>
        ))}
        <span className="muted">Whole months only · trips, not passengers</span>
      </figcaption>
    </figure>
  );
}
