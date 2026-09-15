"""One pipeline run: ingest → validate → transform → publish, with a record.

Exit code 0 when the checks pass (warnings included), 1 when any check is an
error — in which case nothing downstream is rewritten, the run record says
why, and the scheduled workflow fails visibly.

Run:  python -m pipeline.run [--file path.parquet] [--today YYYY-MM-DD] [--force]
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path

from . import config
from .ingest import ingest, previous_snapshot_path, read_snapshot
from .transform import build_marts
from .validate import run_checks, worst

QUALITY_LATEST = config.QUALITY / "latest.json"
QUALITY_HISTORY = config.QUALITY / "history.jsonl"
RUN_HISTORY = config.RUNS / "history.jsonl"
RUN_LATEST = config.RUNS / "latest.json"


def _append(path: Path, record: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, default=str) + "\n")


def _finish(record: dict, started: float) -> None:
    """Append the run record, keep the latest one on its own, and publish the
    last 60 for the dashboard — on success and on failure alike."""
    record["seconds"] = round(time.time() - started, 1)
    _append(RUN_HISTORY, record)
    RUN_LATEST.write_text(json.dumps(record, indent=2, default=str) + "\n")
    lines = RUN_HISTORY.read_text(encoding="utf-8").splitlines()
    records = [json.loads(l) for l in lines[-60:]]
    config.MARTS.mkdir(parents=True, exist_ok=True)
    (config.MARTS / "runs.json").write_text(json.dumps(records, indent=0) + "\n")


def main(file: Path | None = None, today: date | None = None, force: bool = False) -> int:
    started = time.time()
    now = datetime.now(timezone.utc)
    today = today or now.date()
    record: dict = {"run_at": now.isoformat(timespec="seconds"), "today": today.isoformat()}

    try:
        snap = ingest(file.read_bytes() if file else None, now=now)
    except Exception as exc:  # network, upstream shape, disk
        record.update(status="error", stage="ingest", message=str(exc))
        _finish(record, started)
        print(f"ingest failed: {exc}")
        return 1

    record.update(sha256=snap.sha256[:12], new_snapshot=snap.new, rows=snap.rows, max_date=snap.max_date)
    print(f"snapshot {snap.sha256[:12]} {'new' if snap.new else 'already seen'}: {snap.rows} rows to {snap.max_date}")

    df = read_snapshot(config.RAW / snap.path)
    prev_path = previous_snapshot_path() if snap.new else None
    prev = read_snapshot(prev_path) if prev_path else None

    findings = run_checks(df, prev, today)
    status = worst(findings)
    counts = {s: sum(f.severity == s for f in findings) for s in ("error", "warn", "info", "ok")}
    for f in findings:
        print(f"  {f.severity:5s} {f.check:16s} {f.message}")

    quality = {"run_at": record["run_at"], "today": today.isoformat(), "snapshot": snap.sha256[:12], "status": status, "counts": counts, "findings": [f.as_dict() for f in findings]}
    config.QUALITY.mkdir(parents=True, exist_ok=True)
    QUALITY_LATEST.write_text(json.dumps(quality, indent=2, default=str) + "\n")
    _append(QUALITY_HISTORY, {k: v for k, v in quality.items() if k != "findings"} | {"flags": [f.check for f in findings if f.severity in ("error", "warn")]})
    config.MARTS.mkdir(parents=True, exist_ok=True)
    (config.MARTS / "quality.json").write_text(json.dumps(quality, indent=0, default=str) + "\n")

    record.update(status=status, checks=counts, flags=[f.check for f in findings if f.severity in ("error", "warn")])

    if status == "error":
        record.update(stage="validate", message="checks failed; marts not rewritten")
        _finish(record, started)
        print("run FAILED: see data/quality/latest.json")
        return 1

    if snap.new or force:
        result = build_marts(df, today)
        record.update(stage="publish", published=True, latest_month=result["summary"]["latest_month"])
        print(f"published marts: {', '.join(Path(p).name for p in result['files'].values())}")
    else:
        record.update(stage="validate", published=False, message="no new data; marts unchanged")

    _finish(record, started)
    print(f"run {status} in {record['seconds']}s")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # findings carry en dashes; Windows consoles default to cp1252
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--file", type=Path, help="use a local parquet instead of downloading")
    ap.add_argument("--today", type=date.fromisoformat, help="pretend today is this date (freshness, outlier window)")
    ap.add_argument("--force", action="store_true", help="rebuild the marts even if the snapshot is not new")
    a = ap.parse_args()
    sys.exit(main(a.file, a.today, a.force))
