import { ArrowRight, ArrowUpRight, Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { ScanForm } from "../components/scan-form";
import { Badge, Brand, ProvenanceBadge } from "../components/ui";

export default function HomePage() {
  return (
    <div className="editorial-landing">
      <header className="masthead">
        <Brand />
        <nav aria-label="Main navigation">
          <a href="#method">How it works</a>
          <Link href="/report/demo">
            Explore the demo <ArrowUpRight size={15} />
          </Link>
        </nav>
        <span className="edition">An evidence-first approach</span>
      </header>
      <main id="main">
        <section className="landing-lead">
          <div className="landing-argument">
            <p className="section-kicker">
              <span />
              Website intelligence, cross-examined.
            </p>
            <h1>
              Put your website
              <br />
              on <em>trial.</em>
            </h1>
            <p className="landing-deck">
              Inspect a public website. Collect measurable evidence. Challenge suspicious
              findings—and see what survives verification.
            </p>
            <ScanForm />
            <Link className="sample-link" href="/report/demo">
              Read an example investigation <ArrowUpRight size={16} />
            </Link>
            <p className="landing-margin-note">
              A useful finding should come with a reason to believe it.
            </p>
          </div>
          <InvestigationPreview />
        </section>
        <section className="method-editorial" id="method">
          <div className="method-intro">
            <p className="section-kicker">The method</p>
            <h2>
              A claim is a beginning.
              <br />
              <em>Not a conclusion.</em>
            </h2>
            <p>
              More assertions won’t make a website better. A clear trail from observation to verdict
              will.
            </p>
            <span className="method-footnote">
              Five specialist roles. One burden of proof.
              <br />
              The demo illustrates the workflow; agents are not running yet.
            </span>
          </div>
          <div className="method-record">
            <article>
              <span className="method-number">01</span>
              <div>
                <h3>Observe what the browser can prove.</h3>
                <p>
                  Measurements, responses, and the rendered page become inspectable records. In the
                  example: two homepage paints, recorded at 4.3 and 4.1 seconds.
                </p>
                <div className="method-citation">
                  <ProvenanceBadge value="OBSERVED" />
                  <code>E-001</code>
                  <code>E-002</code>
                </div>
              </div>
            </article>
            <article>
              <span className="method-number">02</span>
              <div>
                <h3>Give the claim a worthy opponent.</h3>
                <p>
                  Explorer proposes. Breaker looks for counterexamples. Skeptic asks the
                  uncomfortable question.
                </p>
                <blockquote>
                  “Does the script payload cause the delay, or merely coincide with it?”
                </blockquote>
                <span className="quote-credit">
                  Skeptic’s challenge to claim <code>C-005</code> · Fixture example
                </span>
              </div>
            </article>
            <article>
              <span className="method-number">03</span>
              <div>
                <h3>Reproduce. Then reach a verdict.</h3>
                <p>
                  Reproducer tests the claim. Judge weighs what holds up. When evidence falls short,
                  the result stays uncertain.
                </p>
                <div className="method-outcomes">
                  <span className="status-pill confirmed">
                    <Check size={13} />3 confirmed
                  </span>
                  <span className="status-pill contested">1 contested</span>
                  <span className="status-pill unresolved">1 needs evidence</span>
                </div>
              </div>
            </article>
          </div>
        </section>
        <section className="closing-note">
          <p>
            See the finding.
            <br />
            <em>Question the evidence.</em>
          </p>
          <Link className="button button-primary" href="/report/demo">
            Open the demo report <ArrowRight size={17} />
          </Link>
        </section>
      </main>
      <footer className="editorial-footer">
        <Brand />
        <span>Evidence first. Certainty earned.</span>
        <span>HTML investigations · Browser and AI analysis unavailable</span>
      </footer>
    </div>
  );
}

function InvestigationPreview() {
  return (
    <aside className="investigation-preview" aria-label="Example investigation preview">
      <div className="preview-caption">
        <span>From the case file</span>
        <Badge tone="violet">Fixture data</Badge>
      </div>
      <div className="preview-document">
        <div className="preview-source">
          <code>acme.example</code>
          <span>Finding 01 / 05</span>
        </div>
        <h2>
          A slow first
          <br />
          <em>impression.</em>
        </h2>
        <div className="preview-measure">
          <strong>
            4.2<span>s</span>
          </strong>
          <div>
            Largest contentful paint
            <br />
            <ProvenanceBadge value="DERIVED" />
          </div>
        </div>
        <div className="preview-trace">
          <span>Run A</span>
          <i style={{ width: "86%" }} />
          <code>4.3 s</code>
          <span>Run B</span>
          <i style={{ width: "82%" }} />
          <code>4.1 s</code>
        </div>
        <p className="preview-context">
          The hero paints late in both example runs.
          <br />
          The observation repeats. The cause is still a question.
        </p>
        <div className="preview-proof">
          <div>
            <code>E-001</code>
            <code>E-002</code>
            <ChevronRight size={14} />
            <span className="status-pill confirmed">
              <Check size={13} />
              Confirmed
            </span>
          </div>
          <small>Two supporting records · Example verdict</small>
        </div>
      </div>
      <div className="preview-map">
        <div className="preview-map-label">
          <span>Put the finding in context</span>
          <span>8 mapped routes</span>
        </div>
        <svg
          viewBox="0 0 400 115"
          role="img"
          aria-label="Example site relationships: homepage links to work, journal and studio; journal links to a missing page."
        >
          <g fill="none" stroke="#c0c8d0" strokeWidth="1">
            <path d="M95 30H219M58 44V69H121" />
            <path d="M263 44V69H291" stroke="#ba786c" strokeDasharray="4 3" />
          </g>
          <g fill="#fffefa" stroke="#b6c3d2">
            <rect x="20" y="15" width="75" height="29" rx="3" stroke="#2458a6" />
            <rect x="121" y="55" width="86" height="29" rx="3" />
            <rect x="219" y="15" width="88" height="29" rx="3" />
            <rect x="291" y="55" width="94" height="29" rx="3" stroke="#b5473d" />
          </g>
          <g fill="#4d5560" fontFamily="monospace" fontSize="11">
            <text x="55" y="34" fill="#2458a6">
              /
            </text>
            <text x="146" y="74">
              /work
            </text>
            <text x="238" y="34">
              /journal
            </text>
            <text x="310" y="74" fill="#a14338">
              404 page
            </text>
          </g>
          <circle cx="20" cy="15" r="4" fill="#2458a6" />
        </svg>
      </div>
      <Link className="preview-open" href="/report/demo">
        Follow the evidence <ArrowUpRight size={16} />
      </Link>
    </aside>
  );
}
