"""Data-quality checks on a ridership snapshot.

Each check returns a Finding with a severity:
  error  – the run fails and nothing downstream is published
  warn   – the run succeeds, the finding is published on the dashboard
  info   – recorded, not surfaced
The rules and thresholds are in config.py. Whatever a check knows about the
world (a retired service, an opening) comes from there too, so the code never
special-cases a mode by name.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

import numpy as np
import pandas as pd

from . import config
from .config import MODE_BY_KEY, MODE_KEYS


@dataclass
class Finding:
    check: str
    severity: str  # error | warn | info | ok
    message: str
    details: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {"check": self.check, "severity": self.severity, "message": self.message, "details": self.details}


def _ok(check: str, message: str, **details) -> Finding:
    return Finding(check, "ok", message, details)


# --- structural -----------------------------------------------------------------

def check_schema(df: pd.DataFrame) -> Finding:
    cols = [c for c in df.columns if c != "date"]
    missing = [k for k in MODE_KEYS if k not in cols]
    extra = [c for c in cols if c not in MODE_KEYS]
    non_numeric = [c for c in cols if c not in extra and not pd.api.types.is_numeric_dtype(df[c])]
    if missing or non_numeric:
        return Finding("schema", "error", f"missing columns {missing}; non-numeric {non_numeric}", {"missing": missing, "non_numeric": non_numeric, "extra": extra})
    if extra:
        return Finding("schema", "warn", f"upstream added columns not in config: {extra}", {"extra": extra})
    return _ok("schema", f"{len(cols)} known modes, all numeric")


def check_dates(df: pd.DataFrame, today: date) -> list[Finding]:
    out = []
    dates = pd.to_datetime(df["date"])
    dupes = int(dates.duplicated().sum())
    out.append(Finding("date_unique", "error", f"{dupes} duplicate dates", {"duplicates": dupes}) if dupes else _ok("date_unique", "no duplicate dates"))
    full = pd.date_range(dates.min(), dates.max(), freq="D")
    gaps = full.difference(dates)
    out.append(
        Finding("date_contiguous", "error", f"{len(gaps)} missing days between {dates.min().date()} and {dates.max().date()}", {"missing": [d.date().isoformat() for d in gaps[:20]], "count": len(gaps)})
        if len(gaps)
        else _ok("date_contiguous", f"every day present from {dates.min().date()} to {dates.max().date()}")
    )
    future = int((dates.dt.date > today).sum())
    out.append(Finding("no_future", "error", f"{future} rows dated after {today}", {"count": future}) if future else _ok("no_future", "no rows in the future"))
    return out


def check_non_negative(df: pd.DataFrame) -> Finding:
    cols = [c for c in MODE_KEYS if c in df.columns]
    neg = {c: int((df[c] < 0).sum()) for c in cols if (df[c] < 0).any()}
    return Finding("non_negative", "error", f"negative counts in {list(neg)}", neg) if neg else _ok("non_negative", "no negative counts")


# --- against the previous snapshot ----------------------------------------------

def check_against_previous(df: pd.DataFrame, prev: pd.DataFrame | None) -> list[Finding]:
    if prev is None:
        return [_ok("no_regression", "first snapshot; nothing to compare"), _ok("revisions", "first snapshot; nothing to compare")]
    out = []
    cur_max, prev_max = pd.to_datetime(df["date"]).max(), pd.to_datetime(prev["date"]).max()
    if cur_max < prev_max or len(df) < len(prev):
        out.append(Finding("no_regression", "error", f"snapshot shrank: {len(prev)} rows to {cur_max.date()} → {len(df)} rows to {cur_max.date()}", {"prev_rows": len(prev), "rows": len(df), "prev_max": prev_max.date().isoformat(), "max": cur_max.date().isoformat()}))
    else:
        out.append(_ok("no_regression", f"{len(df) - len(prev)} new rows; latest day {prev_max.date()} → {cur_max.date()}"))

    # Audited figures may be revised; count how many previously published cells moved.
    cols = [c for c in MODE_KEYS if c in df.columns and c in prev.columns]
    a = prev.set_index(pd.to_datetime(prev["date"]))[cols]
    b = df.set_index(pd.to_datetime(df["date"]))[cols].reindex(a.index)
    both = a.notna() & b.notna()
    changed = ((a != b) & both).sum().sum()
    compared = int(both.sum().sum())
    frac = float(changed / compared) if compared else 0.0
    sev = "warn" if frac > config.REVISION_WARN_FRACTION else ("info" if changed else "ok")
    out.append(Finding("revisions", sev, f"{int(changed)} of {compared:,} previously published cells changed ({frac:.2%})", {"changed": int(changed), "compared": compared, "fraction": frac}))
    return out


# --- content ----------------------------------------------------------------------

def check_freshness(df: pd.DataFrame, today: date) -> Finding:
    latest = pd.to_datetime(df["date"]).max().date()
    lag = (today - latest).days
    sev = "warn" if lag > config.FRESHNESS_WARN_DAYS else "ok"
    return Finding("freshness", sev, f"latest day is {latest}, {lag} days behind {today} (warn above {config.FRESHNESS_WARN_DAYS})", {"latest": latest.isoformat(), "lag_days": lag})


def _trailing_zero_run(s: pd.Series) -> int:
    vals = s.dropna().to_numpy()
    n = 0
    for v in vals[::-1]:
        if v == 0:
            n += 1
        else:
            break
    return n


def check_silent_zeros(df: pd.DataFrame) -> list[Finding]:
    """A mode that used to report and now reports 0 for a week. Retired modes
    (config) are expected to; anything else is a flag for a human."""
    out = []
    d = df.set_index(pd.to_datetime(df["date"]))
    for key in [k for k in MODE_KEYS if k in d.columns]:
        s = d[key]
        run = _trailing_zero_run(s)
        if run < config.SILENT_ZERO_DAYS:
            continue
        nz = s[s > 0]
        if nz.empty:
            continue  # never reported: an opening, handled by leading_zeros
        onset = s.dropna().index[len(s.dropna()) - run].date()
        mode = MODE_BY_KEY[key]
        if mode.retired and onset > mode.retired:
            out.append(Finding("silent_zero", "info", f"{mode.label}: 0 since {onset}, service retired {mode.retired} — expected", {"mode": key, "since": onset.isoformat(), "days": run, "retired": mode.retired.isoformat()}))
        else:
            out.append(Finding("silent_zero", "warn", f"{mode.label}: 0 for {run} days since {onset}, last non-zero {nz.index.max().date()} — feed broken or service ended?", {"mode": key, "since": onset.isoformat(), "days": run, "last_nonzero": nz.index.max().date().isoformat()}))
    return out or [_ok("silent_zero", "no mode has gone quiet")]


def check_leading_zeros(df: pd.DataFrame) -> list[Finding]:
    out = []
    d = df.set_index(pd.to_datetime(df["date"]))
    for key in [k for k in MODE_KEYS if k in d.columns]:
        s = d[key].dropna()
        if s.empty or (s > 0).sum() == 0:
            continue
        first_pos = s[s > 0].index.min()
        lead = int((s[s.index < first_pos] == 0).sum())
        if lead:
            out.append(Finding("leading_zeros", "info", f"{MODE_BY_KEY[key].label}: {lead} zero days before first revenue day {first_pos.date()} (opening)", {"mode": key, "days": lead, "first_positive": first_pos.date().isoformat()}))
    return out


def same_weekday_baseline(s: pd.Series, weeks: int = config.OUTLIER_BASELINE_WEEKS) -> pd.Series:
    """Median of the same weekday over the previous `weeks` weeks, per day."""
    lags = [s.shift(7 * k) for k in range(1, weeks + 1)]
    stacked = pd.concat(lags, axis=1)
    stacked = stacked.where(stacked > 0)  # zeros and NaNs do not vote
    return stacked.median(axis=1)


def outliers(df: pd.DataFrame) -> pd.DataFrame:
    """Every (date, mode) more than OUTLIER_LOW below or OUTLIER_HIGH above its
    same-weekday baseline. Retired modes stop being judged at retirement."""
    d = df.set_index(pd.to_datetime(df["date"])).sort_index()
    rows = []
    for key in [k for k in MODE_KEYS if k in d.columns]:
        s = d[key].astype("float")
        mode = MODE_BY_KEY[key]
        if mode.retired:
            s = s[s.index.date <= mode.retired]
        base = same_weekday_baseline(s)
        ratio = s / base
        mask = base.notna() & s.notna() & (s > 0) & ((ratio < config.OUTLIER_LOW) | (ratio > config.OUTLIER_HIGH))
        for ts in s.index[mask]:
            rows.append({"date": ts.date().isoformat(), "mode": key, "label": mode.label, "value": int(s[ts]), "baseline": int(base[ts]), "ratio": round(float(ratio[ts]), 3)})
    return pd.DataFrame(rows, columns=["date", "mode", "label", "value", "baseline", "ratio"])


def check_outliers(df: pd.DataFrame, today: date) -> Finding:
    out = outliers(df)
    recent_from = (pd.Timestamp(today) - pd.Timedelta(days=config.OUTLIER_RECENT_DAYS)).date().isoformat()
    recent = out[out["date"] >= recent_from]
    details = {"total": int(len(out)), "recent": recent.to_dict("records")}
    if len(recent):
        return Finding("outliers", "warn", f"{len(recent)} day/mode values outside {config.OUTLIER_LOW:.0%}–{config.OUTLIER_HIGH:.0%} of their same-weekday baseline in the last {config.OUTLIER_RECENT_DAYS} days ({len(out)} in all history)", details)
    return Finding("outliers", "ok", f"no outliers in the last {config.OUTLIER_RECENT_DAYS} days ({len(out)} in all history)", details)


# --- driver -----------------------------------------------------------------------

def run_checks(df: pd.DataFrame, prev: pd.DataFrame | None, today: date) -> list[Finding]:
    findings = [check_schema(df)]
    if findings[0].severity == "error":
        return findings  # nothing else is meaningful without the columns
    findings += check_dates(df, today)
    findings.append(check_non_negative(df))
    findings += check_against_previous(df, prev)
    findings.append(check_freshness(df, today))
    findings += check_silent_zeros(df)
    findings += check_leading_zeros(df)
    findings.append(check_outliers(df, today))
    return findings


def worst(findings: list[Finding]) -> str:
    order = {"error": 3, "warn": 2, "info": 1, "ok": 0}
    return max((f.severity for f in findings), key=lambda s: order[s], default="ok")
