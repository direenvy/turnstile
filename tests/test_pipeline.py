"""Ingest and transform, end to end, in a temporary data directory."""

from __future__ import annotations

import io
import json
from datetime import date, datetime, timezone

import pandas as pd
import pytest

from pipeline import config
from tests.test_validate import make


@pytest.fixture
def sandbox(tmp_path, monkeypatch):
    """Point every data path at tmp_path so a test never touches data/."""
    for name in ("DATA", "RAW", "TIDY", "MARTS", "QUALITY", "RUNS"):
        monkeypatch.setattr(config, name, tmp_path / name.lower())
    from pipeline import ingest, run, transform

    monkeypatch.setattr(ingest, "RAW", config.RAW)
    monkeypatch.setattr(ingest, "MANIFEST", config.RAW / "manifest.json")
    monkeypatch.setattr(transform, "TIDY", config.TIDY)
    monkeypatch.setattr(transform, "MARTS", config.MARTS)
    monkeypatch.setattr(transform, "TIDY_PARQUET", config.TIDY / "ridership.parquet")
    monkeypatch.setattr(run, "QUALITY_LATEST", config.QUALITY / "latest.json")
    monkeypatch.setattr(run, "QUALITY_HISTORY", config.QUALITY / "history.jsonl")
    monkeypatch.setattr(run, "RUN_HISTORY", config.RUNS / "history.jsonl")
    monkeypatch.setattr(run, "RUN_LATEST", config.RUNS / "latest.json")
    return tmp_path


def to_parquet_bytes(df: pd.DataFrame) -> bytes:
    buf = io.BytesIO()
    out = df.copy()
    out["date"] = out["date"].dt.strftime("%Y-%m-%d")
    out.to_parquet(buf, index=False)
    return buf.getvalue()


def test_ingest_is_idempotent_on_identical_bytes(sandbox):
    from pipeline import ingest

    payload = to_parquet_bytes(make())
    first = ingest.ingest(payload, now=datetime(2026, 9, 1, tzinfo=timezone.utc))
    second = ingest.ingest(payload, now=datetime(2026, 9, 2, tzinfo=timezone.utc))
    assert first.new and not second.new and first.sha256 == second.sha256
    assert len(ingest.load_manifest()) == 1
    assert len(list(config.RAW.glob("*.parquet"))) == 1


def test_ingest_keeps_every_distinct_snapshot(sandbox):
    from pipeline import ingest

    ingest.ingest(to_parquet_bytes(make(days=100)))
    ingest.ingest(to_parquet_bytes(make(days=130)))
    manifest = ingest.load_manifest()
    assert [m["rows"] for m in manifest] == [100, 130]
    assert ingest.previous_snapshot_path().name == manifest[0]["path"]


def test_ingest_refuses_a_file_without_dates(sandbox):
    from pipeline import ingest

    buf = io.BytesIO()
    pd.DataFrame({"x": [1]}).to_parquet(buf, index=False)
    with pytest.raises(ValueError):
        ingest.ingest(buf.getvalue())


def test_marts_use_whole_months_only_and_report_status(sandbox):
    from pipeline import transform

    df = make(days=430, end=date(2026, 7, 31))
    df.loc[df["date"] > pd.Timestamp(config.MODE_BY_KEY["bus_rkn"].retired), "bus_rkn"] = 0
    result = transform.build_marts(df, date(2026, 9, 15))
    monthly = json.loads((config.MARTS / "monthly.json").read_text())
    months = sorted({m["month"] for m in monthly})
    assert months[-1] == "2026-07" and "2025-05" not in months  # the partial first month is dropped
    modes = {m["key"]: m for m in json.loads((config.MARTS / "modes.json").read_text())}
    assert modes["bus_rkn"]["status"] == "retired" and modes["rail_lrt_kj"]["status"] == "active"
    assert result["summary"]["latest_month"] == "2026-07"
    assert result["summary"]["yoy"] is not None
    tidy = pd.read_parquet(config.TIDY / "ridership.parquet")
    assert set(tidy.columns) == {"date", "mode", "system", "trips"}


def test_a_failed_check_blocks_publication_and_is_recorded(sandbox):
    from pipeline import run

    bad = make()
    bad.loc[3, "bus_rkl"] = -5
    path = sandbox / "bad.parquet"
    path.write_bytes(to_parquet_bytes(bad))
    assert run.main(path, today=date(2026, 9, 15)) == 1
    assert not (config.MARTS / "summary.json").exists()
    record = json.loads((config.RUNS / "history.jsonl").read_text().splitlines()[-1])
    assert record["status"] == "error" and "non_negative" in record["flags"]
    assert (config.MARTS / "runs.json").exists()  # the failure is published even though the data is not


def test_a_clean_run_publishes_once_and_then_skips(sandbox):
    from pipeline import run

    path = sandbox / "good.parquet"
    path.write_bytes(to_parquet_bytes(make(days=430)))
    assert run.main(path, today=date(2026, 8, 20)) == 0
    assert (config.MARTS / "summary.json").exists()
    assert run.main(path, today=date(2026, 8, 21)) == 0
    records = [json.loads(l) for l in (config.RUNS / "history.jsonl").read_text().splitlines()]
    assert [r["published"] for r in records] == [True, False]
