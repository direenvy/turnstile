/* The latest run's findings, every check on one row, and the outliers the
   same-weekday rule found — including the ones it found in history. Status
   is shape and weight: filled pill for failed, outlined for warning, grey
   text for passed and noted. */

import { quality, outliers, runs, dateName, num, type Finding } from "@/lib/data";

const LABEL: Record<Finding["severity"], string> = { error: "Failed", warn: "Warning", info: "Noted", ok: "Passed" };

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

function Status({ severity }: { severity: Finding["severity"] }) {
  return <span className={`status status-${severity}`}>{LABEL[severity]}</span>;
}

const th: React.CSSProperties = { padding: "12px 0", fontWeight: 500, fontSize: 12, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-secondary)", textAlign: "left" };

export function Findings() {
  return (
    <ul className="card" style={{ padding: "8px 24px" }}>
      {quality.findings.map((f, i) => (
        <li key={i} className={`grid gap-2 sm:grid-cols-[96px_1fr] sm:gap-6 ${i ? "hairline" : ""}`} style={{ padding: "14px 0" }}>
          <div>
            <Status severity={f.severity} />
          </div>
          <div>
            <p style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.3 }}>{CHECK_NAMES[f.check] ?? f.check}</p>
            <p className="body-sm" style={{ color: "var(--text-secondary)", marginTop: 2 }}>
              {f.message}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function OutlierTable() {
  const byYear = new Map<string, number>();
  for (const o of outliers) byYear.set(o.date.slice(0, 4), (byYear.get(o.date.slice(0, 4)) ?? 0) + 1);
  const peak = Math.max(...byYear.values());
  const recent = [...outliers].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 12);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
      <div className="card" style={{ padding: 24 }}>
        <p className="label">Outliers by year, all history</p>
        <ul style={{ marginTop: 16 }}>
          {[...byYear.entries()].map(([year, n]) => (
            <li key={year} className="flex items-center gap-3 body-sm" style={{ padding: "5px 0" }}>
              <span className="tabular" style={{ width: 36 }}>
                {year}
              </span>
              <span style={{ height: 6, width: `${Math.max(2, (n / peak) * 100)}%`, background: "var(--color-onyx)", opacity: 0.85, borderRadius: 8 }} />
              <span className="tabular secondary">{n}</span>
            </li>
          ))}
        </ul>
        <p className="caption" style={{ color: "var(--text-secondary)", marginTop: 16, lineHeight: 1.4 }}>
          2020 and 2021 are the movement-control orders. The rule was written for feed breaks; run over history it finds the lockdowns.
        </p>
      </div>
      <div className="card" style={{ padding: "8px 24px" }}>
        <table className="w-full body-sm">
          <thead>
            <tr>
              <th style={th}>Date</th>
              <th style={th}>Mode</th>
              <th style={{ ...th, textAlign: "right" }}>Trips</th>
              <th style={{ ...th, textAlign: "right" }}>Baseline</th>
              <th style={{ ...th, textAlign: "right" }}>Ratio</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((o) => (
              <tr key={o.date + o.mode} className="hairline">
                <td className="tabular" style={{ padding: "9px 0", whiteSpace: "nowrap" }}>
                  {dateName(o.date)}
                </td>
                <td>{o.label}</td>
                <td className="tabular text-right">{num(o.value)}</td>
                <td className="tabular text-right secondary">{num(o.baseline)}</td>
                <td className="tabular text-right" style={{ fontWeight: 570 }}>
                  {o.ratio.toFixed(2)}×
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="caption" style={{ color: "var(--text-secondary)", padding: "12px 0", lineHeight: 1.4 }}>
          The twelve most recent. Baseline is the median of the same weekday over the previous eight weeks; below 0.35× or above 2.5× is flagged.
        </p>
      </div>
    </div>
  );
}

export function RunHistory() {
  return (
    <div className="card" style={{ padding: "8px 24px" }}>
      <table className="w-full body-sm">
        <thead>
          <tr>
            <th style={th}>Run</th>
            <th style={th}>Result</th>
            <th style={th}>Data to</th>
            <th style={th}>Flags</th>
            <th style={{ ...th, textAlign: "right" }}>Published</th>
          </tr>
        </thead>
        <tbody>
          {runs.slice(0, 15).map((r) => (
            <tr key={r.run_at} className="hairline">
              <td className="tabular" style={{ padding: "9px 0", whiteSpace: "nowrap" }}>
                {r.run_at.replace("T", " ").slice(0, 16)} UTC
              </td>
              <td>
                <Status severity={r.status} />
              </td>
              <td className="tabular">{r.max_date ? dateName(r.max_date) : "—"}</td>
              <td className="secondary">{r.flags?.length ? r.flags.join(", ") : (r.message ?? "none")}</td>
              <td className="text-right">{r.published ? "yes" : r.new_snapshot === false ? "unchanged" : "no"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
