import ModeGrid from "@/components/ModeGrid";
import { Findings, OutlierTable, RunHistory } from "@/components/Quality";
import SystemChart from "@/components/SystemChart";
import { dateName, monthName, num, pct, quality, runs, summary } from "@/lib/data";

const REPO = "https://github.com/direenvy/turnstile";
const STATUS_WORD = { error: "failed", warn: "passed with warnings", info: "passed", ok: "passed" } as const;

export default function Home() {
  const lastRun = runs[0];
  const flagged = quality.findings.filter((f) => f.severity === "error" || f.severity === "warn");
  return (
    <>
      <nav className="sticky top-0 z-20" style={{ height: 62, background: "var(--surface-card)", borderBottom: "1px solid var(--border-hairline)" }}>
        <div className="mx-auto flex h-full items-center justify-between px-6 lg:px-16" style={{ maxWidth: "var(--page-max-width)" }}>
          <div className="flex items-baseline gap-2.5">
            <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-heading)" }}>Turnstile</span>
            <span className="mono" style={{ fontSize: 10, color: "var(--text-label)" }}>
              data to {summary.latest_date}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <a href="#quality" className="btn-pill hidden sm:inline-block">
              Quality
            </a>
            <a href={REPO} target="_blank" rel="noreferrer" className="btn-secondary" style={{ padding: "8px 16px" }}>
              Repository
            </a>
          </div>
        </div>
      </nav>

      <main className="mx-auto w-full px-6 lg:px-16" style={{ maxWidth: "var(--page-max-width)" }}>
        <header style={{ paddingTop: 64, paddingBottom: 40 }}>
          <span className="tag">Data engineering</span>
          <h1 className="display" style={{ marginTop: 20, maxWidth: 760 }}>
            Malaysia&rsquo;s public-transport ridership, checked before it&rsquo;s published
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.33, color: "var(--text-body)", marginTop: 20, maxWidth: 640 }}>
            A scheduled pipeline fetches data.gov.my&rsquo;s daily ridership file every morning, runs eleven checks on it, and publishes this page only
            when they pass. {num(summary.days)} days, {summary.modes} modes, {num(summary.rows)} rows since {dateName(summary.first_date)}.
          </p>
        </header>

        {/* Status strip: what a reader needs before trusting a number below. */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card" style={{ padding: 20 }}>
            <p style={{ fontSize: 12, color: "var(--text-label)", fontWeight: 500 }}>Last run</p>
            <p className="tabular" style={{ fontSize: 22, fontWeight: 500, color: "var(--text-heading)", marginTop: 4 }}>
              {lastRun ? lastRun.run_at.slice(0, 10) : "—"}
            </p>
            <p style={{ fontSize: 13, color: quality.status === "error" ? "var(--accent)" : "var(--text-body)", marginTop: 2 }}>
              {STATUS_WORD[quality.status]} · {quality.counts.ok + quality.counts.info} of {quality.findings.length} checks clean
            </p>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <p style={{ fontSize: 12, color: "var(--text-label)", fontWeight: 500 }}>Data through</p>
            <p className="tabular" style={{ fontSize: 22, fontWeight: 500, color: "var(--text-heading)", marginTop: 4 }}>
              {dateName(summary.latest_date)}
            </p>
            <p style={{ fontSize: 13, color: summary.lag_days > 45 ? "var(--accent)" : "var(--text-body)", marginTop: 2 }}>
              {summary.lag_days} days behind the run · published monthly after audit
            </p>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <p style={{ fontSize: 12, color: "var(--text-label)", fontWeight: 500 }}>{monthName(summary.latest_month)}, all modes</p>
            <p className="tabular" style={{ fontSize: 22, fontWeight: 500, color: "var(--text-heading)", marginTop: 4 }}>
              {num(summary.latest_month_trips)}
            </p>
            <p style={{ fontSize: 13, color: "var(--text-body)", marginTop: 2 }}>
              trips · {pct(summary.yoy)} vs {monthName(summary.latest_month).replace(/\d{4}$/, (y) => String(Number(y) - 1))}
            </p>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <p style={{ fontSize: 12, color: "var(--text-label)", fontWeight: 500 }}>Busiest mode, last 28 days</p>
            <p style={{ fontSize: 22, fontWeight: 500, color: "var(--text-heading)", marginTop: 4 }}>{summary.busiest_label}</p>
            <p className="tabular" style={{ fontSize: 13, color: "var(--text-body)", marginTop: 2 }}>
              {num(summary.busiest_28d_avg)} trips a day
            </p>
          </div>
        </section>

        {flagged.length > 0 && (
          <section className="card" style={{ marginTop: 16, padding: "14px 20px", borderLeft: "3px solid var(--accent)" }}>
            <p style={{ fontSize: 13, color: "var(--text-heading)", fontWeight: 500 }}>
              {flagged.length === 1 ? "One check is flagged" : `${flagged.length} checks are flagged`}
            </p>
            {flagged.map((f) => (
              <p key={f.check} style={{ fontSize: 13, color: "var(--text-body)", marginTop: 4 }}>
                {f.message}
              </p>
            ))}
          </section>
        )}

        <section style={{ paddingTop: "var(--section-gap)" }}>
          <span className="tag">Since 2019</span>
          <h2 className="subheading" style={{ marginTop: 16, marginBottom: 8 }}>
            Monthly trips by system
          </h2>
          <p style={{ fontSize: 16, color: "var(--text-body)", marginBottom: 24, maxWidth: 620 }}>
            The 2020 and 2021 troughs are the movement-control orders. Bus ridership enters the file in 2022; before that it was not reported, not zero.
          </p>
          <div className="card" style={{ padding: 24 }}>
            <SystemChart />
          </div>
        </section>

        <section style={{ paddingTop: "var(--section-gap)" }}>
          <span className="tag">Last 365 days</span>
          <h2 className="subheading" style={{ marginTop: 16, marginBottom: 8 }}>
            Every mode
          </h2>
          <p style={{ fontSize: 16, color: "var(--text-body)", marginBottom: 24, maxWidth: 620 }}>
            Daily trips, with the last 28 days against the same 28 days a year earlier. Trips, not passengers: an interchange counts twice.
          </p>
          <ModeGrid />
        </section>

        <section id="quality" style={{ paddingTop: "var(--section-gap)" }}>
          <span className="tag">Quality</span>
          <h2 className="subheading" style={{ marginTop: 16, marginBottom: 8 }}>
            What the last run checked
          </h2>
          <p style={{ fontSize: 16, color: "var(--text-body)", marginBottom: 24, maxWidth: 620 }}>
            A failed check stops publication and fails the workflow. A warning publishes, and stays visible here until it clears. Run {quality.snapshot} on{" "}
            {quality.run_at.slice(0, 10)}.
          </p>
          <Findings />
          <h3 className="subheading-sm" style={{ marginTop: 40, marginBottom: 16 }}>
            Outliers the rule found
          </h3>
          <OutlierTable />
          <h3 className="subheading-sm" style={{ marginTop: 40, marginBottom: 16 }}>
            Run history
          </h3>
          <RunHistory />
        </section>

        <footer style={{ marginTop: "var(--section-gap)", paddingTop: 32, paddingBottom: 64, borderTop: "1px solid var(--border-hairline)", fontSize: 13, color: "var(--text-label)", lineHeight: 1.6 }}>
          <p>
            Source: <em>Daily Public Transport Ridership</em>, Prasarana Malaysia and the Ministry of Transport via{" "}
            <a href="https://data.gov.my/data-catalogue/ridership_headline" target="_blank" rel="noreferrer" style={{ color: "var(--text-heading)" }}>
              data.gov.my
            </a>
            , CC BY 4.0. Figures are trips, not unique passengers. Pipeline, checks and this page:{" "}
            <a href={REPO} target="_blank" rel="noreferrer" style={{ color: "var(--text-heading)" }}>
              github.com/direenvy/turnstile
            </a>
            .
          </p>
        </footer>
      </main>
    </>
  );
}
