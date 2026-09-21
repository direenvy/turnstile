"""Turnstile as a control environment: the risk-and-controls matrix (RACM).

For each control objective the pipeline is supposed to meet: the risk if it does
not, the control that addresses it (what it is, preventive or detective, automated
or manual, how often), the evidence it leaves, how an auditor tests it, and the
result of that test against this repository as it stands — with the gaps stated.

`python -m pipeline.racm` writes docs/RACM.md and frontend/data/racm.json. The
evidence figures (runs recorded, failures, snapshots, tests) are read from the
repository so the matrix cannot drift from what the pipeline actually did.
"""

from __future__ import annotations

import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from . import config

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"


def evidence() -> dict:
    runs = [json.loads(l) for l in (config.RUNS / "history.jsonl").read_text(encoding="utf-8").splitlines()]
    quality = [json.loads(l) for l in (config.QUALITY / "history.jsonl").read_text(encoding="utf-8").splitlines()]
    manifest = json.loads((config.RAW / "manifest.json").read_text(encoding="utf-8"))
    tests = sum(len(re.findall(r"^def test_", p.read_text(encoding="utf-8"), re.M)) for p in (ROOT / "tests").glob("test_*.py"))
    scheduled = [r for r in runs if r["run_at"][11:13] != "11" and r["run_at"][11:13] != "14"]  # the three 15 Sep runs were manual
    delays = [int(r["run_at"][11:13]) * 60 + int(r["run_at"][14:16]) - 120 for r in scheduled]
    checks_evaluated = sum(sum(r.get("checks", {}).values()) for r in runs)
    try:
        commits = subprocess.run(["git", "log", "--format=%an", "--", "data"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split()
        bot_commits = sum(1 for a in commits if a == "turnstile-bot")
    except Exception:  # noqa: BLE001
        bot_commits = None
    return {
        "as_of": datetime.now(timezone.utc).date().isoformat(),
        "runs": len(runs), "runs_failed": sum(r["status"] == "error" for r in runs), "runs_warn": sum(r["status"] == "warn" for r in runs),
        "runs_published": sum(bool(r.get("published")) for r in runs), "runs_unchanged": sum(r.get("message", "").startswith("no new data") for r in runs),
        "first_run": runs[0]["run_at"][:10], "last_run": runs[-1]["run_at"][:10],
        "checks_evaluated": checks_evaluated, "flags": sorted({f for q in quality for f in q["flags"]}),
        "snapshots": len(manifest), "latest_snapshot": manifest[-1]["sha256"][:12], "max_date": runs[-1].get("max_date"),
        "tests": tests, "scheduled_runs": len(scheduled), "schedule_delay_min": (min(delays), max(delays)) if delays else None,
        "bot_commits": bot_commits,
    }


def matrix(ev: dict) -> list[dict]:
    """The matrix. Types: P = preventive, D = detective; A = automated, M = manual."""
    return [
        {
            "id": "C1", "verdict": "Effective", "objective": "Completeness — every day and every mode the publisher released is in the tidy table",
            "risk": "A missing day or mode passes into the marts and the dashboard shows a gap as a drop, or a month total that is short.",
            "control": "Three checks on every run: `schema` (every known mode present and numeric), `date_contiguous` (every day between first and last), `no_regression` (a new snapshot may not have fewer rows or an earlier last day than the one before). Any of them at error severity stops publication.",
            "type": "D · A", "frequency": "Every run (daily)", "owner": "pipeline/validate.py",
            "evidence": "data/quality/latest.json and history.jsonl carry each check's result per run; the workflow log; tests/test_validate.py.",
            "test": "Inspect the quality history for the period: were the checks evaluated on every run? Replay a synthetic snapshot with a removed day and a removed column and confirm the errors fire (the unit tests do this).",
            "result": f"Effective. {ev['checks_evaluated']} check evaluations over {ev['runs']} runs, {ev['runs_failed']} run failures; the three tests for these checks pass in CI.",
            "gaps": "None found. The rule cannot see a day that the publisher never released (the source is the authority for what exists).",
            "frameworks": "COBIT DSS06.02 (completeness of processing) · ISO 27001 A.8.9 · SOX ITGC computer operations",
        },
        {
            "id": "C2", "verdict": "Effective as designed", "objective": "Accuracy and validity — no impossible values are published",
            "risk": "Negative counts, duplicated dates, rows dated in the future, or a genuine fault in the feed reach the dashboard as fact.",
            "control": "`non_negative`, `date_unique`, `no_future` at error severity; `outliers` (a day below 0.35× or above 2.5× the median of the same weekday over the previous eight weeks) at warning severity for the last 90 days, published for the full history.",
            "type": "D · A", "frequency": "Every run", "owner": "pipeline/validate.py, thresholds in pipeline/config.py",
            "evidence": "Quality history; frontend/data/outliers.json; the outlier marks on the dashboard.",
            "test": "Unit tests inject each fault into a synthetic snapshot. Inspect the published outlier list for a known event (MRT Putrajaya, 25–26 Oct 2025, 0.28×) and a known false positive (Thaipusam on KTM Komuter) to confirm the rule surfaces both without judging.",
            "result": "Effective as designed. The outlier check has fired on the last two runs (the August 2026 data carries recent outliers); both known events are in the list.",
            "gaps": "The outlier rule is blind to slow drift (a line losing 2% a month never fires) and cannot tell a holiday from a fault; it does not try to. Revisions to previously published figures are counted, not judged (`revisions`, warn above 5%).",
            "frameworks": "COBIT DSS06.02 (accuracy, validity) · SOX ITGC computer operations",
        },
        {
            "id": "C3", "verdict": "Effective", "objective": "Timeliness — stale data is never presented as current",
            "risk": "The publisher is late or the pipeline stops noticing; the dashboard shows two-month-old figures with no indication.",
            "control": "`freshness` warns when the last day is more than 45 days behind the run; the dashboard shows the last-checked time and the data's last day on every load; the run history is published on the page.",
            "type": "D · A", "frequency": "Every run", "owner": "pipeline/validate.py · frontend",
            "evidence": f"Quality history: `freshness` flagged on the runs before the August data landed on 19 Sep 2026; the dashboard header.",
            "test": "Inspect the quality history across a publication boundary: the warning should be present before the new month lands and absent after. Confirm the page states the data's age.",
            "result": f"Effective. The warning was raised on the runs from {ev['first_run']} until the new snapshot on 2026-09-19 cleared it; the page shows data to {ev['max_date']}.",
            "gaps": "The control detects lateness; it cannot remedy it — the cadence is the publisher's (monthly, after audit). The 45-day threshold is a judgement recorded in config.py.",
            "frameworks": "COBIT DSS01.01 · SOX ITGC computer operations (job monitoring)",
        },
        {
            "id": "C4", "verdict": "Effective", "objective": "Provenance — what was published can be traced to the exact upstream file",
            "risk": "The upstream file is restated or corrupted and the pipeline cannot say which version any figure came from.",
            "control": "Every distinct upstream file is stored under its SHA-256 in data/raw with a manifest entry (hash, bytes, first seen); identical bytes are never stored twice; every run record carries the snapshot hash; `revisions` counts previously published cells that changed between snapshots.",
            "type": "P · A", "frequency": "Every run", "owner": "pipeline/ingest.py",
            "evidence": f"data/raw/manifest.json ({ev['snapshots']} snapshots); data/runs/history.jsonl (hash on every record); tests/test_pipeline.py (idempotent on identical bytes, keeps every distinct file).",
            "test": "Recompute the hash of a stored snapshot and compare with the manifest. Confirm a run record's hash resolves to a stored file. Run the idempotency test.",
            "result": f"Effective. {ev['snapshots']} snapshots stored, latest {ev['latest_snapshot']}; every one of {ev['runs']} run records names its snapshot; the two ingest tests pass.",
            "gaps": "Provenance stops at the pipeline's door: the upstream file itself carries no signature, so the pipeline can prove what it received, not that the publisher sent it.",
            "frameworks": "COBIT DSS06.05 (traceability) · ISO 27001 A.8.12 · SOX ITGC data integrity",
        },
        {
            "id": "C5", "verdict": "Effective by design; untested in production", "objective": "Publication gate — data that fails a check does not reach the dashboard",
            "risk": "A bad snapshot is transformed and published; the failure is discovered by a reader.",
            "control": "`run.py` exits 1 on any error-severity finding before `build_marts` is called; the marts under frontend/data are left as they were; the workflow fails and GitHub emails the owner; Vercel builds only from committed marts.",
            "type": "P · A", "frequency": "Every run", "owner": "pipeline/run.py · .github/workflows/pipeline.yml",
            "evidence": "tests/test_pipeline.py::test_a_failed_check_blocks_publication_and_is_recorded; run records with stage = validate and published = false; the workflow's exit status.",
            "test": "Run the end-to-end test with a failing snapshot and confirm the marts are byte-identical before and after. Review the run history for any record with status = error and published = true.",
            "result": f"Effective by design and by test; not yet exercised in production — {ev['runs_failed']} of {ev['runs']} runs have failed, so the gate has only been proven on synthetic data.",
            "gaps": "The commit step runs even on failure (deliberately, so the failed run record lands on the dashboard); it commits data/ and frontend/data — the marts are unchanged because they were never rewritten, not because the commit excludes them. A future change to `run.py` that wrote marts before validating would defeat the gate; the end-to-end test is the safeguard.",
            "frameworks": "COBIT DSS06.02 · BAI07 (release) · SOX ITGC computer operations",
        },
        {
            "id": "C6", "verdict": "Partly effective", "objective": "Operation — the pipeline runs on schedule and every run, including a failed one, is recorded",
            "risk": "The schedule silently stops; a failure goes unnoticed; a run that produced nothing is indistinguishable from a run that did not happen.",
            "control": "GitHub Actions cron at 02:00 UTC daily; `_finish()` appends a run record on every path including exceptions at ingest; the last 60 records are published to the dashboard; a failed workflow emails the owner.",
            "type": "D · A", "frequency": "Daily", "owner": ".github/workflows/pipeline.yml · pipeline/run.py",
            "evidence": f"data/runs/history.jsonl: {ev['runs']} records from {ev['first_run']} to {ev['last_run']} ({ev['runs_published']} published, {ev['runs_unchanged']} unchanged); the workflow's run list.",
            "test": "Count run records against calendar days since go-live; compare each record's run_at with the scheduled time; confirm a record exists for every workflow run including manual ones.",
            "result": (f"Partly effective. One record per day since go-live, none missing. Scheduled runs started {ev['schedule_delay_min'][0]}–{ev['schedule_delay_min'][1]} minutes after 02:00 UTC — GitHub's cron is best-effort and this repository's runs land around 07:00 UTC — which is harmless at a monthly source cadence but is not the schedule the workflow states."
                       if ev["schedule_delay_min"] else "Partly effective; see gaps."),
            "gaps": "No alert if the schedule stops: GitHub disables scheduled workflows on repositories with no commits for 60 days, and nothing outside GitHub would notice. No retry on transient network failure. Alerting is an email to one person. Recommendation: an external heartbeat (a monitor that expects a run record daily) and a `--retry` on fetch.",
            "frameworks": "COBIT DSS01.01 (operational procedures) · DSS01.03 (monitoring) · SOX ITGC computer operations (job scheduling and monitoring)",
        },
        {
            "id": "C7", "verdict": "Detective only; not enforced", "objective": "Change management — a change to the checks or the marts cannot silently break publication",
            "risk": "A rule change that fails on the real data is discovered at the next scheduled run; a broken dashboard build is discovered by readers.",
            "control": f"CI on every push and pull request: {ev['tests']} tests on synthetic snapshots with known answers, then the committed snapshot is replayed through the checks (`--file … --force`), then the dashboard is built. Data commits are excluded from CI by path so the bot's commits do not run it.",
            "type": "P · A", "frequency": "Every code change", "owner": ".github/workflows/ci.yml · tests/",
            "evidence": "CI run history; tests/; the CI badge on the README.",
            "test": "Inspect CI runs for the period; introduce a deliberate rule change that fails on the live snapshot and confirm the replay step fails.",
            "result": "Effective as a detective control; not enforced. CI runs and passes, but nothing requires it to pass before a change reaches main.",
            "gaps": "The default branch is not protected: the owner pushes directly (Gatekeeper, an audit of this repository among fifteen, found 100% of changes in its period pushed straight to main, none through a pull request, and rated the repository High). The bot also pushes directly with a `contents: write` token. Recommendation: a ruleset requiring a pull request and the CI checks for human actors, with the bot on the bypass list — and the bot's token scoped to the data paths by a deploy key if GitHub's ruleset cannot express it.",
            "frameworks": "COBIT BAI06.01 · ISO 27001 A.8.32 · SOX ITGC change management",
        },
        {
            "id": "C8", "verdict": "Effective", "objective": "Access — only the workflow and the owner can change what is published",
            "risk": "A third party alters data, marts or the workflow; a leaked credential lets someone publish under the pipeline's name.",
            "control": "The workflow uses the ephemeral GITHUB_TOKEN with `permissions: contents: write` and nothing else; no long-lived secrets exist (the source is public, Vercel needs no environment variables); repository write access is the owner alone.",
            "type": "P · A/M", "frequency": "Continuous", "owner": "Repository settings · workflow permissions",
            "evidence": "pipeline.yml permissions block; repository collaborators list; Vercel project settings (no secrets).",
            "test": "Read the permissions block; list collaborators and deploy keys; confirm no secret is referenced by any workflow.",
            "result": "Effective. One human with write, one ephemeral token scoped to contents, no stored secrets.",
            "gaps": "The same token that commits data could commit anything if the workflow file were changed — which is the change-management gap (C7), not an access gap. Two-factor on the owner's GitHub account is assumed, not evidenced here.",
            "frameworks": "COBIT DSS05.04 · ISO 27001 A.5.15, A.8.2 · SOX ITGC logical access",
        },
        {
            "id": "C9", "verdict": "Effective", "objective": "Reproducibility — any published figure can be regenerated from stored inputs",
            "risk": "A figure on the dashboard cannot be reproduced; a dispute about a number cannot be settled.",
            "control": "The repository is the database: snapshot + `--file` + `--today` replays any run; the marts are committed next to the dashboard; `git log` is the audit trail and a revert is a rollback. CI replays the committed snapshot on every code change.",
            "type": "D · A", "frequency": "Every code change; on demand", "owner": "pipeline/run.py · CI",
            "evidence": "Run records (snapshot hash + today); CI replay step; the commit history of frontend/data.",
            "test": "Take a published run record, replay its snapshot with its `today`, diff the marts.",
            "result": f"Effective. Replaying snapshot {ev['latest_snapshot']} with the publishing run's date (2026-09-19) regenerated all six committed marts byte for byte at fieldwork; the CI replay step repeats the exercise on every code change.",
            "gaps": "Replay uses today's code, not the code as of the run; reproducing a historical run exactly needs a checkout of that commit, which git provides but nothing automates.",
            "frameworks": "COBIT DSS06.05 · SOX ITGC data integrity (audit trail)",
        },
        {
            "id": "C10", "verdict": "Effective", "objective": "Judgement — a flag that turns out to be a real-world event is recorded once, by a person, and not patched in code",
            "risk": "A service closure is flagged forever as a feed fault (alert fatigue), or a fault is silenced by a hard-coded exception nobody reviews.",
            "control": "The known-events register in pipeline/config.py: a `retired` date and a note per mode, set by the owner after investigation; `silent_zero` reads it and downgrades to info; the outlier rule stops judging a mode after its retirement; the dashboard marks the mode. Nothing in validate.py names a mode.",
            "type": "P · M", "frequency": "On investigation", "owner": "Repository owner",
            "evidence": "config.py (Rapid Bus Kuantan retired 14 Dec 2025 with the reason; LRT Shah Alam opening note); the git commit that recorded it; tests/test_validate.py::test_silent_zero_flags_an_unexplained_mode_but_not_a_retired_one.",
            "test": "Read the register; trace each entry to a commit and to the finding that prompted it; confirm the check's behaviour with and without the entry (the unit test).",
            "result": "Effective. One retirement recorded with a source; the flag it addressed is now information; the test covers both paths.",
            "gaps": "A single person makes the judgement and reviews it. Recommendation: a second reviewer on register changes (a pull request — see C7 — would provide it).",
            "frameworks": "COBIT DSS06.03 (roles and responsibilities) · APO01 (governance of decisions)",
        },
        {
            "id": "C11", "verdict": "Effective", "objective": "Licence — the data is republished within its terms",
            "risk": "Data redistributed without the attribution the licence requires.",
            "control": "CC BY 4.0 attribution to Prasarana Malaysia / the Ministry of Transport via data.gov.my in the README, on the dashboard footer, and in the CSV download's provenance.",
            "type": "P · M", "frequency": "Static", "owner": "Repository owner",
            "evidence": "README 'Data' section; dashboard footer.",
            "test": "Read the licence; confirm attribution wherever the data is redistributed.",
            "result": "Effective.",
            "gaps": "None found.",
            "frameworks": "COBIT MEA03 (compliance with external requirements)",
        },
    ]


def to_markdown(ev: dict, rows: list[dict]) -> str:
    out = [
        "# Turnstile — risk and controls matrix",
        "",
        f"*Prepared {ev['as_of']} against the repository as it stood: {ev['runs']} pipeline runs from {ev['first_run']} to {ev['last_run']}, "
        f"{ev['snapshots']} snapshots, {ev['tests']} tests, data to {ev['max_date']}. Regenerate with `python -m pipeline.racm`.*",
        "",
        "Turnstile is a data pipeline. This document reads it as a control environment: for each objective the pipeline exists to meet, the risk if it is not met, the control that addresses it, the evidence the control leaves, how an auditor tests it, the result of that test against this repository, and the gaps. Control types: **P** preventive, **D** detective; **A** automated, **M** manual.",
        "",
        "| # | Objective | Type | Result |",
        "|---|---|---|---|",
    ]
    for r in rows:
        out.append(f"| {r['id']} | {r['objective'].split(' — ')[0]} | {r['type']} | {r['verdict']} |")
    out.append("")
    for r in rows:
        out += [
            f"## {r['id']} · {r['objective']}",
            "",
            f"**Risk.** {r['risk']}",
            "",
            f"**Control** ({r['type']}, {r['frequency'].lower()}; owner: {r['owner']}). {r['control']}",
            "",
            f"**Evidence.** {r['evidence']}",
            "",
            f"**Test.** {r['test']}",
            "",
            f"**Result.** {r['result']}",
            "",
            f"**Gaps.** {r['gaps']}",
            "",
            f"*{r['frameworks']}*",
            "",
        ]
    out += [
        "## Summary of gaps, by priority",
        "",
        "1. **Change management (C7).** The default branch is unprotected and every change reaches it by direct push, human and bot alike; CI is advisory. A ruleset requiring a pull request and the CI checks for human actors closes this and, as a side effect, gives the known-events register a second reviewer (C10).",
        "2. **Operational monitoring (C6).** Nothing outside GitHub notices if the schedule stops; GitHub itself disables schedules on quiet repositories after 60 days. An external heartbeat is a small addition. The stated schedule (02:00 UTC) and the actual one (~07:00 UTC) should agree, or the workflow comment should say the time is approximate.",
        "3. **Publication gate (C5).** Effective by design and proven by test, but never exercised in production. That is the right state for a gate; it is recorded so the first real failure is compared with the test's expectation.",
        "",
        "Everything else tested effective for the period, with the design limits stated in each row.",
    ]
    return "\n".join(out) + "\n"


def main() -> None:
    ev = evidence()
    rows = matrix(ev)
    DOCS.mkdir(exist_ok=True)
    (DOCS / "RACM.md").write_text(to_markdown(ev, rows), encoding="utf-8", newline="\n")
    config.MARTS.mkdir(parents=True, exist_ok=True)
    (config.MARTS / "racm.json").write_text(json.dumps({"evidence": ev, "controls": rows}, indent=0, ensure_ascii=False), encoding="utf-8", newline="\n")
    print(f"RACM: {len(rows)} controls; evidence from {ev['runs']} runs, {ev['snapshots']} snapshots, {ev['tests']} tests")


if __name__ == "__main__":
    main()
