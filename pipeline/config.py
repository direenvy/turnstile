"""Paths, the upstream source, and what we know about each mode.

Everything the checks need to tell "the feed broke" from "the service ended"
lives here, in the open, so a flag becomes a recorded decision rather than a
silent exception in code.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RAW = DATA / "raw"
TIDY = DATA / "tidy"
MARTS = ROOT / "frontend" / "data"  # the dashboard imports these at build time
CSV = ROOT / "frontend" / "public" / "ridership.csv"  # the tidy table, downloadable from the dashboard
QUALITY = DATA / "quality"
RUNS = DATA / "runs"

SOURCE_URL = "https://storage.data.gov.my/transportation/ridership_headline.parquet"
SOURCE_PAGE = "https://data.gov.my/data-catalogue/ridership_headline"
SOURCE_LICENCE = "CC BY 4.0"
SOURCE_PUBLISHER = "Prasarana Malaysia and the Ministry of Transport, via data.gov.my"


@dataclass(frozen=True)
class Mode:
    key: str
    label: str
    system: str  # "rail" | "bus"
    operator: str
    # The day the service stopped, if it did. Zeros from this day on are expected.
    retired: date | None = None
    note: str = ""


MODES: list[Mode] = [
    Mode("rail_lrt_kj", "LRT Kelana Jaya", "rail", "Rapid Rail"),
    Mode("rail_lrt_ampang", "LRT Ampang / Sri Petaling", "rail", "Rapid Rail"),
    Mode("rail_mrt_kajang", "MRT Kajang", "rail", "Rapid Rail"),
    Mode("rail_mrt_pjy", "MRT Putrajaya", "rail", "Rapid Rail"),
    Mode("rail_monorail", "KL Monorail", "rail", "Rapid Rail"),
    Mode("rail_lrt_shah_alam", "LRT Shah Alam", "rail", "Rapid Rail", note="Opened in stages; the feed carries zeros before the first revenue day."),
    Mode("rail_komuter", "KTM Komuter", "rail", "KTMB"),
    Mode("rail_komuter_utara", "KTM Komuter Utara", "rail", "KTMB"),
    Mode("rail_ets", "KTM ETS", "rail", "KTMB"),
    Mode("rail_intercity", "KTM Intercity", "rail", "KTMB"),
    Mode("rail_tebrau", "KTM Shuttle Tebrau", "rail", "KTMB"),
    Mode("bus_rkl", "Rapid Bus KL", "bus", "Rapid Bus"),
    Mode("bus_rpn", "Rapid Bus Penang", "bus", "Rapid Bus"),
    Mode(
        "bus_rkn",
        "Rapid Bus Kuantan",
        "bus",
        "Rapid Bus",
        retired=date(2025, 12, 14),
        note="Service ended 14 December 2025; replaced by a Sanwa Tours stage-bus service under SBST. The feed reports 0 from 15 December.",
    ),
]

MODE_KEYS = [m.key for m in MODES]
MODE_BY_KEY = {m.key: m for m in MODES}

# Check thresholds. Documented in the README; change them here, not in the checks.
FRESHNESS_WARN_DAYS = 45  # monthly publication plus an audit lag; beyond this something is late
SILENT_ZERO_DAYS = 7  # this many trailing zeros on a mode that used to report is a flag
OUTLIER_BASELINE_WEEKS = 8  # same-weekday median over this many prior weeks
OUTLIER_LOW = 0.35  # below this fraction of baseline is an outlier
OUTLIER_HIGH = 2.5  # above this multiple of baseline is an outlier
OUTLIER_RECENT_DAYS = 90  # only outliers this recent are surfaced as warnings
REVISION_WARN_FRACTION = 0.05  # more than this share of previously published cells changing is a warning
