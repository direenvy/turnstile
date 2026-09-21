# Turnstile — risk and controls matrix

*Prepared 2026-09-21 against the repository as it stood: 8 pipeline runs from 2026-09-15 to 2026-09-20, 2 snapshots, 19 tests, data to 2026-08-31. Regenerate with `python -m pipeline.racm`.*

Turnstile is a data pipeline. This document reads it as a control environment: for each objective the pipeline exists to meet, the risk if it is not met, the control that addresses it, the evidence the control leaves, how an auditor tests it, the result of that test against this repository, and the gaps. Control types: **P** preventive, **D** detective; **A** automated, **M** manual.

| # | Objective | Type | Result |
|---|---|---|---|
| C1 | Completeness | D · A | Effective |
| C2 | Accuracy and validity | D · A | Effective as designed |
| C3 | Timeliness | D · A | Effective |
| C4 | Provenance | P · A | Effective |
| C5 | Publication gate | P · A | Effective by design; untested in production |
| C6 | Operation | D · A | Partly effective |
| C7 | Change management | P · A | Detective only; not enforced |
| C8 | Access | P · A/M | Effective |
| C9 | Reproducibility | D · A | Effective |
| C10 | Judgement | P · M | Effective |
| C11 | Licence | P · M | Effective |

## C1 · Completeness — every day and every mode the publisher released is in the tidy table

**Risk.** A missing day or mode passes into the marts and the dashboard shows a gap as a drop, or a month total that is short.

**Control** (D · A, every run (daily); owner: pipeline/validate.py). Three checks on every run: `schema` (every known mode present and numeric), `date_contiguous` (every day between first and last), `no_regression` (a new snapshot may not have fewer rows or an earlier last day than the one before). Any of them at error severity stops publication.

**Evidence.** data/quality/latest.json and history.jsonl carry each check's result per run; the workflow log; tests/test_validate.py.

**Test.** Inspect the quality history for the period: were the checks evaluated on every run? Replay a synthetic snapshot with a removed day and a removed column and confirm the errors fire (the unit tests do this).

**Result.** Effective. 88 check evaluations over 8 runs, 0 run failures; the three tests for these checks pass in CI.

**Gaps.** None found. The rule cannot see a day that the publisher never released (the source is the authority for what exists).

*COBIT DSS06.02 (completeness of processing) · ISO 27001 A.8.9 · SOX ITGC computer operations*

## C2 · Accuracy and validity — no impossible values are published

**Risk.** Negative counts, duplicated dates, rows dated in the future, or a genuine fault in the feed reach the dashboard as fact.

**Control** (D · A, every run; owner: pipeline/validate.py, thresholds in pipeline/config.py). `non_negative`, `date_unique`, `no_future` at error severity; `outliers` (a day below 0.35× or above 2.5× the median of the same weekday over the previous eight weeks) at warning severity for the last 90 days, published for the full history.

**Evidence.** Quality history; frontend/data/outliers.json; the outlier marks on the dashboard.

**Test.** Unit tests inject each fault into a synthetic snapshot. Inspect the published outlier list for a known event (MRT Putrajaya, 25–26 Oct 2025, 0.28×) and a known false positive (Thaipusam on KTM Komuter) to confirm the rule surfaces both without judging.

**Result.** Effective as designed. The outlier check has fired on the last two runs (the August 2026 data carries recent outliers); both known events are in the list.

**Gaps.** The outlier rule is blind to slow drift (a line losing 2% a month never fires) and cannot tell a holiday from a fault; it does not try to. Revisions to previously published figures are counted, not judged (`revisions`, warn above 5%).

*COBIT DSS06.02 (accuracy, validity) · SOX ITGC computer operations*

## C3 · Timeliness — stale data is never presented as current

**Risk.** The publisher is late or the pipeline stops noticing; the dashboard shows two-month-old figures with no indication.

**Control** (D · A, every run; owner: pipeline/validate.py · frontend). `freshness` warns when the last day is more than 45 days behind the run; the dashboard shows the last-checked time and the data's last day on every load; the run history is published on the page.

**Evidence.** Quality history: `freshness` flagged on the runs before the August data landed on 19 Sep 2026; the dashboard header.

**Test.** Inspect the quality history across a publication boundary: the warning should be present before the new month lands and absent after. Confirm the page states the data's age.

**Result.** Effective. The warning was raised on the runs from 2026-09-15 until the new snapshot on 2026-09-19 cleared it; the page shows data to 2026-08-31.

**Gaps.** The control detects lateness; it cannot remedy it — the cadence is the publisher's (monthly, after audit). The 45-day threshold is a judgement recorded in config.py.

*COBIT DSS01.01 · SOX ITGC computer operations (job monitoring)*

## C4 · Provenance — what was published can be traced to the exact upstream file

**Risk.** The upstream file is restated or corrupted and the pipeline cannot say which version any figure came from.

**Control** (P · A, every run; owner: pipeline/ingest.py). Every distinct upstream file is stored under its SHA-256 in data/raw with a manifest entry (hash, bytes, first seen); identical bytes are never stored twice; every run record carries the snapshot hash; `revisions` counts previously published cells that changed between snapshots.

**Evidence.** data/raw/manifest.json (2 snapshots); data/runs/history.jsonl (hash on every record); tests/test_pipeline.py (idempotent on identical bytes, keeps every distinct file).

**Test.** Recompute the hash of a stored snapshot and compare with the manifest. Confirm a run record's hash resolves to a stored file. Run the idempotency test.

**Result.** Effective. 2 snapshots stored, latest 7705135fff0a; every one of 8 run records names its snapshot; the two ingest tests pass.

**Gaps.** Provenance stops at the pipeline's door: the upstream file itself carries no signature, so the pipeline can prove what it received, not that the publisher sent it.

*COBIT DSS06.05 (traceability) · ISO 27001 A.8.12 · SOX ITGC data integrity*

## C5 · Publication gate — data that fails a check does not reach the dashboard

**Risk.** A bad snapshot is transformed and published; the failure is discovered by a reader.

**Control** (P · A, every run; owner: pipeline/run.py · .github/workflows/pipeline.yml). `run.py` exits 1 on any error-severity finding before `build_marts` is called; the marts under frontend/data are left as they were; the workflow fails and GitHub emails the owner; Vercel builds only from committed marts.

**Evidence.** tests/test_pipeline.py::test_a_failed_check_blocks_publication_and_is_recorded; run records with stage = validate and published = false; the workflow's exit status.

**Test.** Run the end-to-end test with a failing snapshot and confirm the marts are byte-identical before and after. Review the run history for any record with status = error and published = true.

**Result.** Effective by design and by test; not yet exercised in production — 0 of 8 runs have failed, so the gate has only been proven on synthetic data.

**Gaps.** The commit step runs even on failure (deliberately, so the failed run record lands on the dashboard); it commits data/ and frontend/data — the marts are unchanged because they were never rewritten, not because the commit excludes them. A future change to `run.py` that wrote marts before validating would defeat the gate; the end-to-end test is the safeguard.

*COBIT DSS06.02 · BAI07 (release) · SOX ITGC computer operations*

## C6 · Operation — the pipeline runs on schedule and every run, including a failed one, is recorded

**Risk.** The schedule silently stops; a failure goes unnoticed; a run that produced nothing is indistinguishable from a run that did not happen.

**Control** (D · A, daily; owner: .github/workflows/pipeline.yml · pipeline/run.py). GitHub Actions cron at 02:00 UTC daily; `_finish()` appends a run record on every path including exceptions at ingest; the last 60 records are published to the dashboard; a failed workflow emails the owner.

**Evidence.** data/runs/history.jsonl: 8 records from 2026-09-15 to 2026-09-20 (3 published, 5 unchanged); the workflow's run list.

**Test.** Count run records against calendar days since go-live; compare each record's run_at with the scheduled time; confirm a record exists for every workflow run including manual ones.

**Result.** Partly effective. One record per day since go-live, none missing. Scheduled runs started 301–326 minutes after 02:00 UTC — GitHub's cron is best-effort and this repository's runs land around 07:00 UTC — which is harmless at a monthly source cadence but is not the schedule the workflow states.

**Gaps.** No alert if the schedule stops: GitHub disables scheduled workflows on repositories with no commits for 60 days, and nothing outside GitHub would notice. No retry on transient network failure. Alerting is an email to one person. Recommendation: an external heartbeat (a monitor that expects a run record daily) and a `--retry` on fetch.

*COBIT DSS01.01 (operational procedures) · DSS01.03 (monitoring) · SOX ITGC computer operations (job scheduling and monitoring)*

## C7 · Change management — a change to the checks or the marts cannot silently break publication

**Risk.** A rule change that fails on the real data is discovered at the next scheduled run; a broken dashboard build is discovered by readers.

**Control** (P · A, every code change; owner: .github/workflows/ci.yml · tests/). CI on every push and pull request: 19 tests on synthetic snapshots with known answers, then the committed snapshot is replayed through the checks (`--file … --force`), then the dashboard is built. Data commits are excluded from CI by path so the bot's commits do not run it.

**Evidence.** CI run history; tests/; the CI badge on the README.

**Test.** Inspect CI runs for the period; introduce a deliberate rule change that fails on the live snapshot and confirm the replay step fails.

**Result.** Effective as a detective control; not enforced. CI runs and passes, but nothing requires it to pass before a change reaches main.

**Gaps.** The default branch is not protected: the owner pushes directly (Gatekeeper, an audit of this repository among fifteen, found 100% of changes in its period pushed straight to main, none through a pull request, and rated the repository High). The bot also pushes directly with a `contents: write` token. Recommendation: a ruleset requiring a pull request and the CI checks for human actors, with the bot on the bypass list — and the bot's token scoped to the data paths by a deploy key if GitHub's ruleset cannot express it.

*COBIT BAI06.01 · ISO 27001 A.8.32 · SOX ITGC change management*

## C8 · Access — only the workflow and the owner can change what is published

**Risk.** A third party alters data, marts or the workflow; a leaked credential lets someone publish under the pipeline's name.

**Control** (P · A/M, continuous; owner: Repository settings · workflow permissions). The workflow uses the ephemeral GITHUB_TOKEN with `permissions: contents: write` and nothing else; no long-lived secrets exist (the source is public, Vercel needs no environment variables); repository write access is the owner alone.

**Evidence.** pipeline.yml permissions block; repository collaborators list; Vercel project settings (no secrets).

**Test.** Read the permissions block; list collaborators and deploy keys; confirm no secret is referenced by any workflow.

**Result.** Effective. One human with write, one ephemeral token scoped to contents, no stored secrets.

**Gaps.** The same token that commits data could commit anything if the workflow file were changed — which is the change-management gap (C7), not an access gap. Two-factor on the owner's GitHub account is assumed, not evidenced here.

*COBIT DSS05.04 · ISO 27001 A.5.15, A.8.2 · SOX ITGC logical access*

## C9 · Reproducibility — any published figure can be regenerated from stored inputs

**Risk.** A figure on the dashboard cannot be reproduced; a dispute about a number cannot be settled.

**Control** (D · A, every code change; on demand; owner: pipeline/run.py · CI). The repository is the database: snapshot + `--file` + `--today` replays any run; the marts are committed next to the dashboard; `git log` is the audit trail and a revert is a rollback. CI replays the committed snapshot on every code change.

**Evidence.** Run records (snapshot hash + today); CI replay step; the commit history of frontend/data.

**Test.** Take a published run record, replay its snapshot with its `today`, diff the marts.

**Result.** Effective. Replaying snapshot 7705135fff0a with the publishing run's date (2026-09-19) regenerated all six committed marts byte for byte at fieldwork; the CI replay step repeats the exercise on every code change.

**Gaps.** Replay uses today's code, not the code as of the run; reproducing a historical run exactly needs a checkout of that commit, which git provides but nothing automates.

*COBIT DSS06.05 · SOX ITGC data integrity (audit trail)*

## C10 · Judgement — a flag that turns out to be a real-world event is recorded once, by a person, and not patched in code

**Risk.** A service closure is flagged forever as a feed fault (alert fatigue), or a fault is silenced by a hard-coded exception nobody reviews.

**Control** (P · M, on investigation; owner: Repository owner). The known-events register in pipeline/config.py: a `retired` date and a note per mode, set by the owner after investigation; `silent_zero` reads it and downgrades to info; the outlier rule stops judging a mode after its retirement; the dashboard marks the mode. Nothing in validate.py names a mode.

**Evidence.** config.py (Rapid Bus Kuantan retired 14 Dec 2025 with the reason; LRT Shah Alam opening note); the git commit that recorded it; tests/test_validate.py::test_silent_zero_flags_an_unexplained_mode_but_not_a_retired_one.

**Test.** Read the register; trace each entry to a commit and to the finding that prompted it; confirm the check's behaviour with and without the entry (the unit test).

**Result.** Effective. One retirement recorded with a source; the flag it addressed is now information; the test covers both paths.

**Gaps.** A single person makes the judgement and reviews it. Recommendation: a second reviewer on register changes (a pull request — see C7 — would provide it).

*COBIT DSS06.03 (roles and responsibilities) · APO01 (governance of decisions)*

## C11 · Licence — the data is republished within its terms

**Risk.** Data redistributed without the attribution the licence requires.

**Control** (P · M, static; owner: Repository owner). CC BY 4.0 attribution to Prasarana Malaysia / the Ministry of Transport via data.gov.my in the README, on the dashboard footer, and in the CSV download's provenance.

**Evidence.** README 'Data' section; dashboard footer.

**Test.** Read the licence; confirm attribution wherever the data is redistributed.

**Result.** Effective.

**Gaps.** None found.

*COBIT MEA03 (compliance with external requirements)*

## Summary of gaps, by priority

1. **Change management (C7).** The default branch is unprotected and every change reaches it by direct push, human and bot alike; CI is advisory. A ruleset requiring a pull request and the CI checks for human actors closes this and, as a side effect, gives the known-events register a second reviewer (C10).
2. **Operational monitoring (C6).** Nothing outside GitHub notices if the schedule stops; GitHub itself disables schedules on quiet repositories after 60 days. An external heartbeat is a small addition. The stated schedule (02:00 UTC) and the actual one (~07:00 UTC) should agree, or the workflow comment should say the time is approximate.
3. **Publication gate (C5).** Effective by design and proven by test, but never exercised in production. That is the right state for a gate; it is recorded so the first real failure is compared with the test's expectation.

Everything else tested effective for the period, with the design limits stated in each row.
