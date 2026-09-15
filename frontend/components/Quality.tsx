/* The latest run's findings, every check on one row, and the outliers the
   same-weekday rule found — including the ones it found in history. */

import { quality, outliers, runs, dateName, num, type Finding } from "@/lib/data";

const LABEL: Record<Finding["severity"], string> = { error: "Failed", warn: "Warning", info: "Noted", ok: "Passed" };
const COLOUR: Record<Finding["severity"], string> = { error: "var(--accent)", warn: "var(--accent)", info: "var(--text-label)", ok: "var(--data)" };

const CHECK_NAMES: Record<string, string> = {
  schema: "Schema — every known mode present and numeric",
  date_unique: "Dates unique",
  date_contiguous: "Dates contiguous — no missing days",
  no_future: "No rows in the future",
  non_negative: "No negative counts",
  no_regression: "Snapshot did not shrink",
  revisions: "Previously published cells unchanged",
  freshness: "Freshness — days behind today",
  silent_zero: "Silent zero — a mode that stopped reporting",
  leading_zeros: "Leading zeros — a line before it opened",
  outliers: "Outliers against the same-weekday baseline",
};

export function Findings() {
  return (
    <ul className="card" style={{ padding: "4px 20px" }}>
      {quality.findings.map((f, i) => (
        <li key={i} className="grid gap-1 sm:grid-cols-[88px_1fr] sm:gap-4" style={{ padding: "12px 0", borderTop: i ? "1px solid var(--border-hairline)" : "none" }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: COLOUR[f.severity], textTransform: "uppercase", letterSpacing: "0.06em" }}>{LABEL[f.severity]}</span>
          <div>
            <p style={{ fontSize: 14, color: "var(--text-heading)", fontWeight: 500 }}>{CHECK_NAMES[f.check] ?? f.check}</p>
            <p style={{ fontSize: 13, color: "var(--text-body)", marginTop: 2 }}>{f.message}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function OutlierTable() {
  const byYear = new Map<string, number>();
  for (const o of outliers) byYear.set(o.date.slice(0, 4), (byYear.get(o.date.slice(0, 4)) ?? 0) + 1);
  const recent = [...outliers].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 12);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
      <div className="card" style={{ padding: 20 }}>
        <p style={{ fontSize: 12, color: "var(--text-label)", fontWeight: 500 }}>Outliers by year, all history</p>
        <ul style={{ marginTop: 8 }}>
          {[...byYear.entries()].map(([year, n]) => (
            <li key={year} className="flex items-center gap-3" style={{ padding: "4px 0", fontSize: 13 }}>
              <span className="tabular" style={{ width: 36, color: "var(--text-heading)" }}>{year}</span>
              <span style={{ height: 8, width: `${Math.max(2, (n / Math.max(...byYear.values())) * 100)}%`, background: "var(--data)", opacity: 0.8, borderRadius: 2 }} />
              <span className="tabular" style={{ color: "var(--text-body)" }}>{n}</span>
            </li>
          ))}
        </ul>
        <p style={{ fontSize: 12, color: "var(--text-label)", marginTop: 12, lineHeight: 1.4 }}>
          2020 and 2021 are the movement-control orders. The rule was written for feed breaks; run over history it finds the lockdowns.
        </p>
      </div>
      <div className="card" style={{ padding: "4px 20px" }}>
        <table className="w-full" style={{ fontSize: 13 }}>
          <thead>
            <tr style={{ color: "var(--text-label)", fontSize: 11, textAlign: "left" }}>
              <th style={{ padding: "10px 0", fontWeight: 500 }}>Date</th>
              <th style={{ fontWeight: 500 }}>Mode</th>
              <th className="text-right" style={{ fontWeight: 500 }}>Trips</th>
              <th className="text-right" style={{ fontWeight: 500 }}>Baseline</th>
              <th className="text-right" style={{ fontWeight: 500 }}>Ratio</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((o) => (
              <tr key={o.date + o.mode} style={{ borderTop: "1px solid var(--border-hairline)" }}>
                <td className="tabular" style={{ padding: "8px 0", whiteSpace: "nowrap" }}>{dateName(o.date)}</td>
                <td>{o.label}</td>
                <td className="tabular text-right">{num(o.value)}</td>
                <td className="tabular text-right" style={{ color: "var(--text-label)" }}>{num(o.baseline)}</td>
                <td className="tabular text-right" style={{ color: o.ratio < 1 ? "var(--accent)" : "var(--data)", fontWeight: 500 }}>
                  {o.ratio.toFixed(2)}×
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 12, color: "var(--text-label)", padding: "10px 0", lineHeight: 1.4 }}>
          The twelve most recent. Baseline is the median of the same weekday over the previous eight weeks; below 0.35× or above 2.5× is flagged.
        </p>
      </div>
    </div>
  );
}

export function RunHistory() {
  return (
    <div className="card" style={{ padding: "4px 20px" }}>
      <table className="w-full" style={{ fontSize: 13 }}>
        <thead>
          <tr style={{ color: "var(--text-label)", fontSize: 11, textAlign: "left" }}>
            <th style={{ padding: "10px 0", fontWeight: 500 }}>Run</th>
            <th style={{ fontWeight: 500 }}>Result</th>
            <th style={{ fontWeight: 500 }}>Data to</th>
            <th style={{ fontWeight: 500 }}>Flags</th>
            <th className="text-right" style={{ fontWeight: 500 }}>Published</th>
          </tr>
        </thead>
        <tbody>
          {runs.slice(0, 15).map((r) => (
            <tr key={r.run_at} style={{ borderTop: "1px solid var(--border-hairline)" }}>
              <td className="tabular" style={{ padding: "8px 0", whiteSpace: "nowrap" }}>{r.run_at.replace("T", " ").slice(0, 16)} UTC</td>
              <td style={{ color: COLOUR[r.status], fontWeight: 500 }}>{LABEL[r.status]}</td>
              <td className="tabular">{r.max_date ? dateName(r.max_date) : "—"}</td>
              <td style={{ color: "var(--text-body)" }}>{r.flags?.length ? r.flags.join(", ") : r.message ?? "none"}</td>
              <td className="text-right">{r.published ? "yes" : r.new_snapshot === false ? "unchanged" : "no"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
