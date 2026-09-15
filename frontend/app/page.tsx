import ModeGrid from "@/components/ModeGrid";
import { Findings, OutlierTable, RunHistory } from "@/components/Quality";
import SystemChart from "@/components/SystemChart";
import { dateName, monthName, num, pct, quality, runs, summary } from "@/lib/data";

const REPO = "https://github.com/direenvy/turnstile";
const STATUS_WORD = { error: "failed", warn: "passed with warnings", info: "passed", ok: "passed" } as const;

function Stat({ label, value, note, flagged = false }: { label: string; value: string; note: string; flagged?: boolean }) {
  return (
    <div className="card" style={{ padding: 24 }}>
      <p className="label">{label}</p>
      <p className="tabular" style={{ fontSize: 24, lineHeight: 1.15, letterSpacing: "-0.24px", fontWeight: 400, marginTop: 12 }}>
        {value}
      </p>
      <p className="body-sm" style={{ marginTop: 6, color: "var(--text-secondary)", fontWeight: flagged ? 500 : 400 }}>
        {note}
      </p>
    </div>
  );
}

function Section({ id, kicker, title, lede, children }: { id?: string; kicker: string; title: string; lede: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ paddingTop: "var(--section-gap)", scrollMarginTop: 24 }}>
      <p className="label">{kicker}</p>
      <h2 className="heading" style={{ marginTop: 12 }}>
        {title}
      </h2>
      <p className="subheading" style={{ marginTop: 10, marginBottom: 24, maxWidth: 640, color: "var(--text-secondary)" }}>
        {lede}
      </p>
      {children}
    </section>
  );
}

export default function Home() {
  const lastRun = runs[0];
  const flagged = quality.findings.filter((f) => f.severity === "error" || f.severity === "warn");
  const yearAgo = monthName(summary.latest_month).replace(/\d{4}$/, (y) => String(Number(y) - 1));

  return (
    <>
      {/* Hero: the dawn arc, edge to edge, the nav floating on its dark top and the headline carved into its light foot. */}
      <header className="relative" style={{ background: "var(--gradient-dawn-arc)", minHeight: "min(92vh, 860px)" }}>
        <nav className="mx-auto flex items-center justify-between px-6 lg:px-12" style={{ maxWidth: "var(--page-max-width)", height: 72 }}>
          <span style={{ fontSize: 14, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--color-parchment-canvas)" }}>Turnstile</span>
          <div className="flex items-center gap-1">
            <a href="#modes" className="pill on-dark" style={{ fontSize: 14 }}>
              Modes
            </a>
            <a href="#quality" className="pill on-dark" style={{ fontSize: 14 }}>
              Quality
            </a>
            <span aria-hidden="true" style={{ width: 1, height: 16, background: "rgba(255,255,255,0.35)", margin: "0 8px" }} />
            <a href={REPO} target="_blank" rel="noreferrer" className="pill on-dark" style={{ fontSize: 14 }}>
              Repository
            </a>
          </div>
        </nav>
        <div className="mx-auto px-6 lg:px-12" style={{ maxWidth: "var(--page-max-width)", position: "absolute", left: 0, right: 0, bottom: 56 }}>
          <h1 className="display" style={{ maxWidth: 900 }}>
            Malaysia&rsquo;s public-transport ridership, <span className="dissolve">checked before it&rsquo;s published.</span>
          </h1>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2" style={{ marginTop: 24 }}>
            <a href="#numbers" className="pill" style={{ paddingLeft: 0 }}>
              The numbers ↓
            </a>
            <span className="body-sm tabular" style={{ color: "var(--text-secondary)" }}>
              Data to {dateName(summary.latest_date)} · last checked {lastRun ? lastRun.run_at.slice(0, 10) : "—"}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full px-6 lg:px-12" style={{ maxWidth: "var(--page-max-width)" }}>
        <section id="numbers" style={{ paddingTop: 48 }}>
          <p className="subheading" style={{ maxWidth: 720 }}>
            A scheduled pipeline fetches data.gov.my&rsquo;s daily ridership file every morning, runs eleven checks on it, and publishes this page only when
            they pass. {num(summary.days)} days, {summary.modes} modes, {num(summary.rows)} rows since {dateName(summary.first_date)}.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" style={{ marginTop: 32 }}>
            <Stat label="Last run" value={lastRun ? lastRun.run_at.slice(0, 10) : "—"} note={`${STATUS_WORD[quality.status]} · ${quality.counts.ok + quality.counts.info} of ${quality.findings.length} checks clean`} flagged={quality.status === "error"} />
            <Stat label="Data through" value={dateName(summary.latest_date)} note={`${summary.lag_days} days behind the run · published monthly after audit`} flagged={summary.lag_days > 45} />
            <Stat label={`${monthName(summary.latest_month)}, all modes`} value={num(summary.latest_month_trips)} note={`trips · ${pct(summary.yoy)} vs ${yearAgo}`} />
            <Stat label="Busiest mode, last 28 days" value={summary.busiest_label} note={`${num(summary.busiest_28d_avg)} trips a day`} />
          </div>
          {flagged.length > 0 && (
            <div className="card" style={{ marginTop: 16, padding: "16px 24px", display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
              <span className="status status-warn">{flagged.length === 1 ? "1 flag" : `${flagged.length} flags`}</span>
              <div>
                {flagged.map((f) => (
                  <p key={f.check} className="body-sm" style={{ color: "var(--text-primary)" }}>
                    {f.message}
                  </p>
                ))}
              </div>
            </div>
          )}
        </section>

        <Section kicker="Since 2019" title="Monthly trips by system" lede="The 2020 and 2021 troughs are the movement-control orders. Bus ridership enters the file in 2022; before that it was not reported, not zero.">
          <div className="card" style={{ padding: "var(--card-padding)" }}>
            <SystemChart />
          </div>
        </Section>

        <Section id="modes" kicker="Last 365 days" title="Every mode" lede="Daily trips, with the last 28 days against the same 28 days a year earlier. Trips, not passengers: an interchange counts twice.">
          <ModeGrid />
        </Section>

        <Section
          id="quality"
          kicker="Quality"
          title="What the last run checked"
          lede={`A failed check stops publication and fails the workflow. A warning publishes, and stays visible here until it clears. Run ${quality.snapshot} on ${quality.run_at.slice(0, 10)}.`}
        >
          <Findings />
          <h3 className="heading-sm" style={{ marginTop: 48, marginBottom: 16 }}>
            Outliers the rule found
          </h3>
          <OutlierTable />
          <h3 className="heading-sm" style={{ marginTop: 48, marginBottom: 16 }}>
            Run history
          </h3>
          <RunHistory />
        </Section>
      </main>

      {/* Footer: the gradient's darkest stop, as a solid — the page bookends itself. */}
      <footer style={{ marginTop: "var(--section-gap)", background: "var(--surface-dark)", color: "var(--color-parchment-canvas)" }}>
        <div className="mx-auto grid gap-8 px-6 py-12 md:grid-cols-[1fr_1fr] lg:px-12" style={{ maxWidth: "var(--page-max-width)" }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" }}>Turnstile</p>
            <p className="body-sm" style={{ marginTop: 12, maxWidth: 480, color: "rgba(255,255,255,0.72)" }}>
              Source: <em>Daily Public Transport Ridership</em>, Prasarana Malaysia and the Ministry of Transport via data.gov.my, CC BY 4.0. Figures are trips, not unique passengers.
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-x-2 gap-y-1 md:justify-end">
            <a href="https://data.gov.my/data-catalogue/ridership_headline" target="_blank" rel="noreferrer" className="pill on-dark" style={{ fontSize: 14 }}>
              data.gov.my ↗
            </a>
            <a href={REPO} target="_blank" rel="noreferrer" className="pill on-dark" style={{ fontSize: 14 }}>
              github.com/direenvy/turnstile ↗
            </a>
            <a href={`${REPO}/actions/workflows/pipeline.yml`} target="_blank" rel="noreferrer" className="pill on-dark" style={{ fontSize: 14 }}>
              Pipeline runs ↗
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
