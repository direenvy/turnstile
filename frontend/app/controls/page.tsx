import type { Metadata } from "next";
import racm from "@/data/racm.json";

const REPO = "https://github.com/direenvy/turnstile";

type Control = {
  id: string;
  verdict: string;
  objective: string;
  risk: string;
  control: string;
  type: string;
  frequency: string;
  owner: string;
  evidence: string;
  test: string;
  result: string;
  gaps: string;
  frameworks: string;
};

const ev = racm.evidence as Record<string, string | number | number[] | string[] | null>;
const controls = racm.controls as Control[];

export const metadata: Metadata = {
  title: "Turnstile — risk and controls matrix",
  description: "The pipeline read as a control environment: eleven control objectives, the risk each addresses, the control, its evidence, how it is tested, the result against the repository, and the gaps.",
};

/** Verdict by shape and weight: fully effective is plain, a qualification is outlined,
 *  a gap that needs fixing is filled. */
function Verdict({ v }: { v: string }) {
  const cls = /not enforced|Partly/.test(v) ? "status status-error" : /untested|as designed/.test(v) ? "status status-warn" : "status status-ok";
  return <span className={cls}>{v}</span>;
}

/** Inline `code` spans in the authored text, nothing else. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("`") ? (
          <code key={i} className="tabular" style={{ fontSize: "0.92em", background: "rgba(12,16,24,0.06)", padding: "1px 5px", borderRadius: 4 }}>
            {p.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className="body-sm" style={{ marginTop: 6, color: "var(--text-secondary)", lineHeight: 1.5 }}>
        {children}
      </p>
    </div>
  );
}

export default function Controls() {
  const delay = ev.schedule_delay_min as number[] | null;
  const th = "label text-left" as const;
  const cell = { padding: "12px 16px 12px 0", borderTop: "1px solid var(--hairline)", verticalAlign: "top" as const };

  return (
    <>
      <header style={{ background: "var(--gradient-dawn-arc)" }}>
        <nav className="mx-auto flex items-center justify-between px-6 lg:px-12" style={{ maxWidth: "var(--page-max-width)", height: 72 }}>
          <a href="/" style={{ fontSize: 14, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--color-parchment-canvas)" }}>
            Turnstile
          </a>
          <div className="flex items-center gap-1">
            <a href="/" className="pill on-dark" style={{ fontSize: 14 }}>
              Dashboard
            </a>
            <a href="/#quality" className="pill on-dark hidden sm:inline-flex" style={{ fontSize: 14 }}>
              Quality
            </a>
            <span aria-hidden="true" style={{ width: 1, height: 16, background: "rgba(255,255,255,0.35)", margin: "0 8px" }} />
            <a href={`${REPO}/blob/main/docs/RACM.md`} target="_blank" rel="noreferrer" className="pill on-dark" style={{ fontSize: 14 }}>
              RACM.md ↗
            </a>
          </div>
        </nav>
        <div className="mx-auto px-6 lg:px-12" style={{ maxWidth: "var(--page-max-width)", paddingTop: 96, paddingBottom: 56 }}>
          <p className="label" style={{ color: "rgba(255,255,255,0.72)" }}>
            Risk and controls matrix
          </p>
          <h1 className="display" style={{ maxWidth: 960, marginTop: 16, color: "var(--color-parchment-canvas)" }}>
            The pipeline, read as a control environment.
          </h1>
          <p className="subheading" style={{ marginTop: 20, maxWidth: 720, color: "rgba(255,255,255,0.8)" }}>
            Eleven objectives the pipeline exists to meet. For each: the risk if it is not met, the control, the evidence it leaves, how an auditor tests it, the result against this repository as it stands, and
            the gaps.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full px-6 lg:px-12" style={{ maxWidth: "var(--page-max-width)" }}>
        <section style={{ paddingTop: 48 }}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Runs recorded", `${ev.runs}`, `${ev.first_run} to ${ev.last_run} · ${ev.runs_failed} failed · ${ev.runs_published} published`],
              ["Check evaluations", `${ev.checks_evaluated}`, `eleven checks per run · flags raised: ${(ev.flags as string[]).join(", ")}`],
              ["Snapshots", `${ev.snapshots}`, `stored by hash · latest ${ev.latest_snapshot} · data to ${ev.max_date}`],
              ["Schedule drift", delay ? `${(delay[0] / 60).toFixed(1)}–${(delay[1] / 60).toFixed(1)} h` : "—", "scheduled 02:00 UTC; GitHub's cron runs it around 07:00"],
            ].map(([label, value, note]) => (
              <div key={label} className="card" style={{ padding: 24 }}>
                <p className="label">{label}</p>
                <p className="tabular" style={{ fontSize: 24, lineHeight: 1.15, letterSpacing: "-0.24px", marginTop: 12 }}>
                  {value}
                </p>
                <p className="body-sm" style={{ marginTop: 6, color: "var(--text-secondary)" }}>
                  {note}
                </p>
              </div>
            ))}
          </div>
          <p className="caption" style={{ marginTop: 16, color: "var(--text-muted)" }}>
            Evidence figures are read from the repository by <code>pipeline/racm.py</code> when the matrix is generated ({ev.as_of}); {ev.tests} tests in <code>tests/</code>. Types: P preventive, D detective; A automated, M
            manual.
          </p>
        </section>

        <section style={{ paddingTop: "var(--section-gap)" }}>
          <p className="label">Summary</p>
          <h2 className="heading" style={{ marginTop: 12 }}>
            Eleven controls, three gaps
          </h2>
          <div className="card" style={{ padding: "var(--card-padding)", marginTop: 24 }}>
            <div style={{ overflowX: "auto" }}>
              <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 640 }}>
                <thead>
                  <tr>
                    <th className={th} style={{ paddingBottom: 10 }}>#</th>
                    <th className={th} style={{ paddingBottom: 10 }}>Objective</th>
                    <th className={th} style={{ paddingBottom: 10 }}>Type</th>
                    <th className={th} style={{ paddingBottom: 10 }}>Result</th>
                  </tr>
                </thead>
                <tbody className="body-sm">
                  {controls.map((c) => (
                    <tr key={c.id}>
                      <td className="tabular" style={{ ...cell, fontWeight: 500 }}>
                        <a href={`#${c.id}`}>{c.id}</a>
                      </td>
                      <td style={cell}>{c.objective.split(" — ")[0]}</td>
                      <td className="tabular" style={{ ...cell, whiteSpace: "nowrap", color: "var(--text-secondary)" }}>
                        {c.type}
                      </td>
                      <td style={cell}>
                        <Verdict v={c.verdict} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3" style={{ marginTop: 16 }}>
            {[
              ["1 · Change management (C7)", "The default branch is unprotected and every change reaches it by direct push, human and bot alike; CI is advisory. A ruleset requiring a pull request and the CI checks for human actors closes this — and gives the known-events register a second reviewer."],
              ["2 · Operational monitoring (C6)", "Nothing outside GitHub notices if the schedule stops, and GitHub disables schedules on quiet repositories after 60 days. An external heartbeat is a small addition. The stated schedule and the actual one should agree."],
              ["3 · Publication gate (C5)", "Effective by design and proven by test, never exercised in production. The right state for a gate — recorded so the first real failure is compared with what the test expects."],
            ].map(([t, b]) => (
              <div key={t} className="card" style={{ padding: 24 }}>
                <p className="heading-sm" style={{ fontSize: 18 }}>
                  {t}
                </p>
                <p className="body-sm" style={{ marginTop: 10, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  {b}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section style={{ paddingTop: "var(--section-gap)" }}>
          <p className="label">The matrix</p>
          <div className="grid gap-4" style={{ marginTop: 16 }}>
            {controls.map((c) => (
              <article key={c.id} id={c.id} className="card" style={{ padding: "var(--card-padding)", scrollMarginTop: 24 }}>
                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                  <div style={{ maxWidth: 760 }}>
                    <p className="label">
                      {c.id} · {c.type} · {c.frequency}
                    </p>
                    <h3 className="heading-sm" style={{ marginTop: 8 }}>
                      {c.objective}
                    </h3>
                  </div>
                  <Verdict v={c.verdict} />
                </div>
                <div className="grid gap-x-8 gap-y-5 md:grid-cols-2" style={{ marginTop: 24 }}>
                  <Field label="Risk">
                    <Rich text={c.risk} />
                  </Field>
                  <Field label="Control">
                    <Rich text={c.control} />
                  </Field>
                  <Field label="Evidence">
                    <Rich text={c.evidence} />
                  </Field>
                  <Field label="Test">
                    <Rich text={c.test} />
                  </Field>
                  <Field label="Result">
                    <span style={{ color: "var(--text-primary)" }}>
                      <Rich text={c.result} />
                    </span>
                  </Field>
                  <Field label="Gaps">
                    <Rich text={c.gaps} />
                  </Field>
                </div>
                <p className="caption" style={{ marginTop: 20, color: "var(--text-muted)" }}>
                  Owner: <Rich text={c.owner} /> · {c.frameworks}
                </p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer style={{ marginTop: "var(--section-gap)", background: "var(--surface-dark)", color: "var(--color-parchment-canvas)" }}>
        <div className="mx-auto grid gap-8 px-6 py-12 md:grid-cols-[1fr_1fr] lg:px-12" style={{ maxWidth: "var(--page-max-width)" }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" }}>Turnstile</p>
            <p className="body-sm" style={{ marginTop: 12, maxWidth: 480, color: "rgba(255,255,255,0.72)" }}>
              Framework references: COBIT 2019, ISO/IEC 27001:2022 Annex A, the SOX IT general-control objectives. The change-management gap was found by Gatekeeper, an audit of fifteen repositories including this one.
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-x-2 gap-y-1 md:justify-end">
            <a href="/" className="pill on-dark" style={{ fontSize: 14 }}>
              Dashboard
            </a>
            <a href={`${REPO}/blob/main/docs/RACM.md`} target="_blank" rel="noreferrer" className="pill on-dark" style={{ fontSize: 14 }}>
              RACM.md ↗
            </a>
            <a href="https://gatekeeper-nine-woad.vercel.app" target="_blank" rel="noreferrer" className="pill on-dark" style={{ fontSize: 14 }}>
              Gatekeeper ↗
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
