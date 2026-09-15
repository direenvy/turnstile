/* The marts the pipeline publishes into frontend/data. They are imported at
   build time, so the dashboard is static and redeploys when the data commits. */

import summaryJson from "@/data/summary.json";
import modesJson from "@/data/modes.json";
import monthlyJson from "@/data/monthly.json";
import dailyJson from "@/data/daily_recent.json";
import weekdayJson from "@/data/weekday.json";
import outliersJson from "@/data/outliers.json";
import qualityJson from "@/data/quality.json";
import runsJson from "@/data/runs.json";

export type Summary = {
  first_date: string;
  latest_date: string;
  lag_days: number;
  rows: number;
  days: number;
  modes: number;
  modes_active: number;
  latest_month: string;
  latest_month_trips: number;
  latest_month_rail: number;
  latest_month_bus: number;
  year_ago_month_trips: number | null;
  yoy: number | null;
  busiest_mode: string;
  busiest_label: string;
  busiest_28d_avg: number;
};

export type Mode = {
  key: string;
  label: string;
  system: "rail" | "bus";
  operator: string;
  status: "active" | "new" | "retired";
  retired: string | null;
  note: string;
  first_date: string;
  first_revenue_date: string | null;
  last_date: string;
  last_28d_avg: number | null;
  prior_year_28d_avg: number | null;
  yoy: number | null;
};

export type Monthly = { month: string; mode: string; system: string; trips: number };
export type Daily = { date: string; mode: string; trips: number };
export type Weekday = { mode: string; weekday: number; trips: number };
export type Outlier = { date: string; mode: string; label: string; value: number; baseline: number; ratio: number };

export type Finding = {
  check: string;
  severity: "error" | "warn" | "info" | "ok";
  message: string;
  details: Record<string, unknown>;
};

export type Quality = {
  run_at: string;
  today: string;
  snapshot: string;
  status: Finding["severity"];
  counts: Record<Finding["severity"], number>;
  findings: Finding[];
};

export type Run = {
  run_at: string;
  today: string;
  sha256?: string;
  new_snapshot?: boolean;
  rows?: number;
  max_date?: string;
  status: Finding["severity"];
  checks?: Record<string, number>;
  flags?: string[];
  stage?: string;
  published?: boolean;
  message?: string;
  seconds: number;
};

export const summary = summaryJson as Summary;
export const modes = modesJson as Mode[];
export const monthly = monthlyJson as Monthly[];
export const daily = dailyJson as Daily[];
export const weekday = weekdayJson as Weekday[];
export const outliers = outliersJson as Outlier[];
export const quality = qualityJson as Quality;
export const runs = (runsJson as Run[]).slice().reverse();

export const fmt = new Intl.NumberFormat("en-MY");
export const num = (n: number | null | undefined) => (n == null ? "—" : fmt.format(Math.round(n)));
export const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));
export const pct = (x: number | null | undefined, digits = 1) => (x == null ? "—" : `${x > 0 ? "+" : ""}${(x * 100).toFixed(digits)}%`);
export const monthName = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
export const dateName = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
