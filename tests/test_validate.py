"""The checks, exercised on synthetic snapshots where the right answer is known."""

from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd
import pytest

from pipeline import config, validate
from pipeline.config import MODE_KEYS

TODAY = date(2026, 9, 15)


def make(days: int = 120, end: date = date(2026, 7, 31), level: int = 100_000, seed: int = 0) -> pd.DataFrame:
    """A tidy synthetic snapshot: every mode reports a weekday/weekend pattern
    with small noise, ending on `end`."""
    rng = np.random.default_rng(seed)
    dates = pd.date_range(end=pd.Timestamp(end), periods=days, freq="D")
    weekend = (dates.dayofweek >= 5).astype(float)
    df = pd.DataFrame({"date": dates})
    for i, key in enumerate(MODE_KEYS):
        base = level * (1 + i / 10)
        df[key] = (base * (1 - 0.4 * weekend) * rng.normal(1, 0.03, len(dates))).round().astype("int64")
    return df


def by(findings, check):
    return [f for f in findings if f.check == check]


def test_clean_snapshot_has_no_errors_or_warnings():
    df = make()
    findings = validate.run_checks(df, None, date(2026, 8, 15))  # 15 days after the last row: fresh
    assert validate.worst(findings) in ("ok", "info")


def test_missing_column_is_an_error_and_stops_the_rest():
    df = make().drop(columns=["rail_lrt_kj"])
    findings = validate.run_checks(df, None, TODAY)
    assert findings[0].check == "schema" and findings[0].severity == "error"
    assert len(findings) == 1


def test_unknown_extra_column_is_only_a_warning():
    df = make()
    df["rail_new_line"] = 1
    assert validate.check_schema(df).severity == "warn"


def test_duplicate_and_missing_dates_are_errors():
    df = make()
    dup = pd.concat([df, df.iloc[[5]]]).reset_index(drop=True)
    assert by(validate.check_dates(dup, TODAY), "date_unique")[0].severity == "error"
    gap = df.drop(index=[10, 11])
    f = by(validate.check_dates(gap, TODAY), "date_contiguous")[0]
    assert f.severity == "error" and f.details["count"] == 2


def test_future_dates_and_negatives_are_errors():
    df = make(end=TODAY + pd.Timedelta(days=3).to_pytimedelta())
    assert by(validate.check_dates(df, TODAY), "no_future")[0].severity == "error"
    df = make()
    df.loc[3, "bus_rkl"] = -1
    assert validate.check_non_negative(df).severity == "error"


def test_a_shrunken_snapshot_is_a_regression():
    prev = make(days=120)
    cur = make(days=100)
    assert by(validate.check_against_previous(cur, prev), "no_regression")[0].severity == "error"


def test_revisions_are_counted_and_only_warn_past_the_threshold():
    prev = make(days=120)
    cur = prev.copy()
    cur.loc[0, "bus_rkl"] += 1
    f = by(validate.check_against_previous(cur, prev), "revisions")[0]
    assert f.severity == "info" and f.details["changed"] == 1
    cur = prev.copy()
    cols = MODE_KEYS
    cur.loc[: len(cur) // 2, cols] = cur.loc[: len(cur) // 2, cols] + 1  # half the cells
    f = by(validate.check_against_previous(cur, prev), "revisions")[0]
    assert f.severity == "warn" and f.details["fraction"] > config.REVISION_WARN_FRACTION


def test_freshness_warns_past_the_lag():
    df = make(end=date(2026, 7, 31))
    assert validate.check_freshness(df, date(2026, 8, 20)).severity == "ok"
    assert validate.check_freshness(df, date(2026, 9, 30)).severity == "warn"


def test_silent_zero_flags_an_unexplained_mode_but_not_a_retired_one():
    df = make()
    df.loc[df.index[-10:], "rail_lrt_kj"] = 0  # an active line goes quiet
    f = [f for f in validate.check_silent_zeros(df) if f.details.get("mode") == "rail_lrt_kj"][0]
    assert f.severity == "warn" and f.details["days"] == 10

    df = make(days=400)  # long enough to hold reports before the retirement date
    df.loc[df["date"] > pd.Timestamp(config.MODE_BY_KEY["bus_rkn"].retired), "bus_rkn"] = 0
    f = [f for f in validate.check_silent_zeros(df) if f.details.get("mode") == "bus_rkn"][0]
    assert f.severity == "info"


def test_opening_zeros_are_information_not_a_flag():
    df = make()
    df.loc[df.index[:30], "rail_lrt_shah_alam"] = 0
    findings = validate.check_leading_zeros(df)
    assert findings and findings[0].severity == "info" and findings[0].details["days"] == 30
    assert all(f.details.get("mode") != "rail_lrt_shah_alam" for f in validate.check_silent_zeros(df) if f.severity == "warn")


def test_outlier_uses_same_weekday_baseline_so_weekends_are_not_flagged():
    df = make(days=120)
    assert validate.outliers(df).empty  # a 40% weekend dip every week is the pattern, not an outlier
    df.loc[df.index[-3], "rail_mrt_pjy"] = int(df.loc[df.index[-3], "rail_mrt_pjy"] * 0.2)  # a real collapse
    out = validate.outliers(df)
    assert len(out) == 1 and out.iloc[0]["mode"] == "rail_mrt_pjy" and out.iloc[0]["ratio"] < config.OUTLIER_LOW


def test_recent_outliers_warn_and_old_ones_do_not():
    df = make(days=200)
    df.loc[df.index[-3], "rail_mrt_pjy"] = 1000
    assert validate.check_outliers(df, TODAY).severity == "warn"
    df = make(days=200)
    df.loc[df.index[20], "rail_mrt_pjy"] = 1000  # ~6 months ago
    f = validate.check_outliers(df, TODAY)
    assert f.severity == "ok" and f.details["total"] == 1


def test_retired_modes_are_not_judged_after_retirement():
    df = make(days=400)
    retired = config.MODE_BY_KEY["bus_rkn"].retired
    df.loc[df["date"] > pd.Timestamp(retired), "bus_rkn"] = 0
    assert (validate.outliers(df)["mode"] != "bus_rkn").all()
