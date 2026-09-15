"use client";

/* Average daily trips by weekday over the last 52 weeks, rail and bus.
   This is the shape the outlier rule has to respect: a same-weekday baseline
   exists because Saturday is not a broken Friday. Hovering a day shows its
   figures and how it compares with the weekday average. */

import { useState, type MouseEvent } from "react";
import { modes, weekday, num } from "@/lib/data";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
// DuckDB dayofweek: 0 = Sunday … 6 = Saturday. Reorder to Monday-first.
const ORDER = [1, 2, 3, 4, 5, 6, 0];

const W = 960;
const H = 240;
const PAD = { top: 20, right: 16, bottom: 28, left: 56 };
const PW = W - PAD.left - PAD.right;
const PH = H - PAD.top - PAD.bottom;

export default function WeekdayChart() {
  const [hover, setHover] = useState<number | null>(null);

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
  const cx = (i: number) => PAD.left + group * (i + 0.5);
  const ticks = Array.from({ length: top / step + 1 }, (_, k) => k * step);

  const weekdayAvg = (vals: number[]) => vals.slice(0, 5).reduce((s, v) => s + v, 0) / 5;
  const railAvg = weekdayAvg(rail);
  const busAvg = weekdayAvg(bus);
  const share = (v: number, avg: number) => `${Math.round((v / avg) * 100)}% of a weekday`;

  function onMove(e: MouseEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.floor((px - PAD.left) / group);
    setHover(i >= 0 && i < 7 ? i : null);
  }

  // The readout sits to the right of the hovered day, or to its left near the right edge.
  const card = hover !== null ? { x: cx(hover) > W * 0.62 ? cx(hover) - group * 0.42 - 226 : cx(hover) + group * 0.42, y: PAD.top } : null;

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Average daily trips by weekday, rail and bus, last 52 weeks" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--hairline)" />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)" className="tabular">
              {t === 0 ? "0" : t >= 1e6 ? `${(t / 1e6).toFixed(1)}M` : `${Math.round(t / 1e3)}k`}
            </text>
          </g>
        ))}
        {DAYS.map((d, i) => {
          const dim = hover !== null && hover !== i;
          return (
            <g key={d} style={{ opacity: dim ? 0.45 : 1, transition: "opacity 160ms ease" }}>
              {hover === i && <rect x={cx(i) - group / 2} y={PAD.top} width={group} height={PH} fill="var(--color-onyx)" opacity={0.04} rx={8} />}
              <rect x={cx(i) - bar - 2} y={y(rail[i])} width={bar} height={y(0) - y(rail[i])} fill="var(--color-onyx)" rx={3}>
                <title>{`${LONG[i]}: rail ${num(rail[i])} trips a day, ${share(rail[i], railAvg)}`}</title>
              </rect>
              <rect x={cx(i) + 2} y={y(bus[i])} width={bar} height={y(0) - y(bus[i])} fill="var(--color-slate-veil)" opacity={0.7} rx={3}>
                <title>{`${LONG[i]}: bus ${num(bus[i])} trips a day, ${share(bus[i], busAvg)}`}</title>
              </rect>
              <text x={cx(i)} y={H - 8} textAnchor="middle" fontSize={11} fill={i >= 5 || hover === i ? "var(--color-onyx)" : "var(--text-muted)"} fontWeight={i >= 5 || hover === i ? 500 : 400}>
                {d}
              </text>
            </g>
          );
        })}

        {hover !== null && card && (
          <g pointerEvents="none" transform={`translate(${card.x}, ${card.y})`}>
            <rect width={226} height={74} rx={8} fill="var(--color-parchment-canvas)" stroke="var(--hairline)" />
            <text x={12} y={18} fontSize={11} fill="var(--text-secondary)">
              {LONG[hover]} · average over 52 weeks
            </text>
            <text x={12} y={38} fontSize={12} fill="var(--color-onyx)" className="tabular">
              Rail {num(rail[hover])}
              <tspan fill="var(--text-secondary)"> · {share(rail[hover], railAvg)}</tspan>
            </text>
            <text x={12} y={58} fontSize={12} fill="var(--color-slate-veil)" className="tabular">
              Bus {num(bus[hover])}
              <tspan fill="var(--text-secondary)"> · {share(bus[hover], busAvg)}</tspan>
            </text>
          </g>
        )}
      </svg>
      <figcaption className="body-sm flex flex-wrap items-center gap-x-6 gap-y-1" style={{ marginTop: 12, color: "var(--text-secondary)" }}>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: "var(--color-onyx)" }} /> Rail
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: "var(--color-slate-veil)", opacity: 0.7 }} /> Bus
        </span>
        <span className="tabular">
          Rail runs at {Math.round((rail[5] / railAvg) * 100)}% of a weekday on Saturday and {Math.round((rail[6] / railAvg) * 100)}% on Sunday; bus at {Math.round((bus[5] / busAvg) * 100)}% on Saturday. Weekday rail average {num(railAvg)} trips.
        </span>
      </figcaption>
    </figure>
  );
}
