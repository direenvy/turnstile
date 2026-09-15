"""Tidy the wide snapshot into a long table, then build the small marts the
dashboard reads. DuckDB does the aggregation straight off the parquet file;
the marts are JSON so a static site can import them at build time."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import duckdb
import pandas as pd

from .config import MARTS, MODE_BY_KEY, MODE_KEYS, MODES, TIDY
from .validate import outliers

TIDY_PARQUET = TIDY / "ridership.parquet"


def tidy(df: pd.DataFrame) -> pd.DataFrame:
    cols = [k for k in MODE_KEYS if k in df.columns]
    long = df.melt(id_vars="date", value_vars=cols, var_name="mode", value_name="trips").dropna(subset=["trips"])
    long["date"] = pd.to_datetime(long["date"]).dt.date
    long["trips"] = long["trips"].astype("int64")
    long["system"] = long["mode"].map({m.key: m.system for m in MODES})
    return long.sort_values(["mode", "date"]).reset_index(drop=True)[["date", "mode", "system", "trips"]]


def write_tidy(df: pd.DataFrame) -> Path:
    TIDY.mkdir(parents=True, exist_ok=True)
    tidy(df).to_parquet(TIDY_PARQUET, index=False)
    return TIDY_PARQUET


def _dump(name: str, obj) -> Path:
    MARTS.mkdir(parents=True, exist_ok=True)
    path = MARTS / f"{name}.json"
    path.write_text(json.dumps(obj, indent=0, default=str) + "\n")
    return path


def build_marts(df: pd.DataFrame, today: date) -> dict:
    path = write_tidy(df).as_posix()
    con = duckdb.connect()
    con.execute(f"CREATE VIEW r AS SELECT * FROM read_parquet('{path}')")

    latest = con.execute("SELECT max(date) FROM r").fetchone()[0]
    first = con.execute("SELECT min(date) FROM r").fetchone()[0]

    # Whole months only, so the newest partial month never masquerades as a drop.
    monthly = con.execute(
        """
        WITH m AS (
          SELECT date_trunc('month', date) AS month, mode, system, sum(trips) AS trips, count(*) AS days
          FROM r GROUP BY 1, 2, 3
        )
        SELECT strftime(month, '%Y-%m') AS month, mode, system, trips::BIGINT AS trips
        FROM m
        WHERE days = date_diff('day', month, month + INTERVAL 1 MONTH)
        ORDER BY month, mode
        """
    ).df()

    daily_recent = con.execute(
        "SELECT date, mode, trips FROM r WHERE date > ? - INTERVAL 365 DAY ORDER BY mode, date",
        [latest],
    ).df()
    daily_recent["date"] = daily_recent["date"].astype(str)

    weekday = con.execute(
        """
        SELECT mode, dayofweek(date) AS weekday, round(avg(trips))::BIGINT AS trips
        FROM r WHERE date > ? - INTERVAL 364 DAY AND trips > 0
        GROUP BY 1, 2 ORDER BY 1, 2
        """,
        [latest],
    ).df()

    # Per-mode status and the two 28-day windows a year apart.
    modes_out = []
    for m in MODES:
        row = con.execute(
            """
            SELECT min(date), max(date), min(CASE WHEN trips > 0 THEN date END),
                   avg(CASE WHEN date > ? - INTERVAL 28 DAY THEN trips END),
                   avg(CASE WHEN date > ? - INTERVAL 393 DAY AND date <= ? - INTERVAL 365 DAY THEN trips END)
            FROM r WHERE mode = ?
            """,
            [latest, latest, latest, m.key],
        ).fetchone()
        first_d, last_d, first_pos, last28, prior28 = row
        if first_d is None:
            continue
        if m.retired:
            status = "retired"
        elif first_pos and (latest - first_pos).days < 365:
            status = "new"
        else:
            status = "active"
        modes_out.append(
            {
                "key": m.key,
                "label": m.label,
                "system": m.system,
                "operator": m.operator,
                "status": status,
                "retired": m.retired.isoformat() if m.retired else None,
                "note": m.note,
                "first_date": str(first_d),
                "first_revenue_date": str(first_pos) if first_pos else None,
                "last_date": str(last_d),
                "last_28d_avg": round(float(last28)) if last28 is not None else None,
                "prior_year_28d_avg": round(float(prior28)) if prior28 is not None else None,
                "yoy": round(float(last28) / float(prior28) - 1, 4) if last28 and prior28 else None,
            }
        )

    # Headline: the latest complete month against the same month a year earlier.
    full_months = sorted(monthly["month"].unique())
    latest_month = full_months[-1]
    year_ago = f"{int(latest_month[:4]) - 1}{latest_month[4:]}"
    total_latest = int(monthly.loc[monthly.month == latest_month, "trips"].sum())
    total_year_ago = int(monthly.loc[monthly.month == year_ago, "trips"].sum()) if year_ago in full_months else None
    by_system = monthly[monthly.month == latest_month].groupby("system")["trips"].sum().to_dict()
    busiest = max((m for m in modes_out if m["last_28d_avg"]), key=lambda m: m["last_28d_avg"])

    summary = {
        "first_date": str(first),
        "latest_date": str(latest),
        "lag_days": (today - latest).days,
        "rows": int(con.execute("SELECT count(*) FROM r").fetchone()[0]),
        "days": int(con.execute("SELECT count(DISTINCT date) FROM r").fetchone()[0]),
        "modes": len(modes_out),
        "modes_active": sum(m["status"] != "retired" for m in modes_out),
        "latest_month": latest_month,
        "latest_month_trips": total_latest,
        "latest_month_rail": int(by_system.get("rail", 0)),
        "latest_month_bus": int(by_system.get("bus", 0)),
        "year_ago_month_trips": total_year_ago,
        "yoy": round(total_latest / total_year_ago - 1, 4) if total_year_ago else None,
        "busiest_mode": busiest["key"],
        "busiest_label": busiest["label"],
        "busiest_28d_avg": busiest["last_28d_avg"],
    }

    out_outliers = outliers(df).to_dict("records")

    written = {
        "summary": _dump("summary", summary),
        "modes": _dump("modes", modes_out),
        "monthly": _dump("monthly", monthly.to_dict("records")),
        "daily_recent": _dump("daily_recent", daily_recent.to_dict("records")),
        "weekday": _dump("weekday", weekday.to_dict("records")),
        "outliers": _dump("outliers", out_outliers),
    }
    con.close()
    return {"summary": summary, "files": {k: str(v) for k, v in written.items()}}
