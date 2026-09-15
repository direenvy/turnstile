"""Fetch the upstream parquet and keep it only if it changed.

Every snapshot is content-addressed (sha256), so re-running on a day when
data.gov.my has not published anything is a no-op that still records the
attempt. The manifest is the ingest log: one entry per distinct file seen.
"""

from __future__ import annotations

import hashlib
import io
import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

from .config import RAW, SOURCE_URL

MANIFEST = RAW / "manifest.json"


@dataclass
class Snapshot:
    sha256: str
    fetched_at: str
    bytes: int
    rows: int
    columns: list[str]
    min_date: str
    max_date: str
    path: str
    new: bool


def load_manifest() -> list[dict]:
    return json.loads(MANIFEST.read_text()) if MANIFEST.exists() else []


def latest_snapshot_path() -> Path | None:
    manifest = load_manifest()
    return RAW / manifest[-1]["path"] if manifest else None


def previous_snapshot_path() -> Path | None:
    manifest = load_manifest()
    return RAW / manifest[-2]["path"] if len(manifest) > 1 else None


def fetch(url: str = SOURCE_URL, timeout: int = 60) -> bytes:
    r = requests.get(url, timeout=timeout, headers={"User-Agent": "turnstile/1.0 (github.com/direenvy/turnstile)"})
    r.raise_for_status()
    return r.content


def ingest(payload: bytes | None = None, now: datetime | None = None) -> Snapshot:
    """Store `payload` (or the live download) under its hash. Returns the snapshot
    record; `new` is False when the bytes were already on disk."""
    RAW.mkdir(parents=True, exist_ok=True)
    payload = fetch() if payload is None else payload
    now = now or datetime.now(timezone.utc)
    sha = hashlib.sha256(payload).hexdigest()
    df = pd.read_parquet(io.BytesIO(payload))
    if "date" not in df.columns or df.empty:
        raise ValueError("Upstream file has no `date` column or no rows; refusing to store it.")
    dates = pd.to_datetime(df["date"])

    manifest = load_manifest()
    known = {m["sha256"] for m in manifest}
    filename = f"ridership_headline.{sha[:12]}.parquet"
    snap = Snapshot(
        sha256=sha,
        fetched_at=now.isoformat(timespec="seconds"),
        bytes=len(payload),
        rows=int(len(df)),
        columns=list(df.columns),
        min_date=dates.min().date().isoformat(),
        max_date=dates.max().date().isoformat(),
        path=filename,
        new=sha not in known,
    )
    if snap.new:
        (RAW / filename).write_bytes(payload)
        entry = asdict(snap)
        del entry["new"]
        manifest.append(entry)
        MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    return snap


def read_snapshot(path: Path) -> pd.DataFrame:
    df = pd.read_parquet(path)
    df["date"] = pd.to_datetime(df["date"])
    return df.sort_values("date").reset_index(drop=True)
