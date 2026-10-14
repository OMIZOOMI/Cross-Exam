import { ArrowRight, ArrowUpRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import { CaseSequence, type Stage18Projection } from "../components/case-sequence";
import { ScanForm } from "../components/scan-form";
import { Brand } from "../components/ui";
import { demoReport } from "../lib/demo-report";

function createDemoProjection(): Stage18Projection {
  const claim = demoReport.claims.find((item) => item.id === "C-005");
  const finding = demoReport.findings.find((item) => item.claimId === "C-005");
  const challenge = demoReport.challenges.find((item) => item.claimId === "C-005");
  const verdict = demoReport.verdicts.find((item) => item.claimId === "C-005");

  if (!claim || !finding || !challenge || !verdict) {
    throw new Error("The demo projection requires the matching C-005 challenge and verdict.");
  }

  return {
    source: demoReport.summary.source,
    targetUrl: demoReport.summary.targetUrl,
    pages: demoReport.pages.map(({ id, path, title, statusCode }) => ({
      id,
      path,
      title,
      statusCode,
    })),
    observation: {
      pagePaths: finding.affectedPaths,
      evidence: demoReport.evidence
        .filter((item) => claim.evidenceIds.includes(item.id))
        .map(({ id, title, kind }) => ({ id, title, kind })),
    },
    claim: {
      id: claim.id,
      statement: claim.statement,
      evidenceIds: claim.evidenceIds,
      affectedPaths: finding.affectedPaths,
    },
    challenge: {
      id: challenge.id,
      question: challenge.question,
      evidenceIds: challenge.evidenceIds,
      status: challenge.status,
      raisedBy: challenge.raisedBy,
    },
    verdict: {
      id: verdict.id,
      status: verdict.status,
      rationale: verdict.rationale,
      evidenceIds: verdict.evidenceIds,
    },
  };
}

const demoProjection = createDemoProjection();

export default function HomePage() {
  return (
    <div className="stage18-landing stage181-landing">
      <header className="stage18-header">
        <Brand />
        <nav className="stage18-nav" aria-label="Main navigation">
          <a href="#product">Product</a>
          <a href="#how-it-works">How it works</a>
          <Link href="/report/demo">Demo</Link>
          <a href="https://github.com/OMIZOOMI/Cross-Exam" target="_blank" rel="noreferrer">
            GitHub <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </nav>
        <span className="stage18-header-note">Local HTTP now · roles offline-only</span>
      </header>

      <main id="main">
        <section
          className="stage18-hero stage181-hero"
          id="how-it-works"
          aria-labelledby="hero-title"
        >
          <div className="stage18-hero-copy stage181-hero-copy">
            <p className="stage18-eyebrow">
              <span className="stage18-eyebrow-dot" aria-hidden="true" />
              Evidence-backed website investigations.
            </p>
            <h1 id="hero-title">
              <span>Your website</span> <span>says it works.</span> <em>Prove it.</em>
            </h1>
            <p className="stage18-hero-deck stage181-hero-deck">
              Map the surface. Keep the evidence. Let every verdict carry its limit.
            </p>
            <div className="stage18-hero-actions stage181-hero-actions">
              <div className="stage18-primary-cta">
                <span className="stage18-cta-label">Run a local investigation</span>
                <ScanForm />
              </div>
              <Link className="stage18-button stage18-button-secondary" href="/report/demo">
                See the demo case <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <p className="stage18-hero-caption stage181-hero-caption">
              Local HTTP collection now. The visual record is synthetic; browser execution, real
              providers, and observed reproduction are unavailable here.
            </p>
          </div>
          <CaseSequence projection={demoProjection} />
        </section>

        <section className="stage18-product" id="product" aria-labelledby="product-title">
          <div className="stage18-section-intro">
            <p className="stage18-eyebrow">The product</p>
            <h2 id="product-title">A clearer answer starts with a narrower claim.</h2>
            <p>
              Veyra keeps collection, interpretation, and uncertainty distinct so a useful finding
              can be checked instead of merely repeated.
            </p>
          </div>
          <div className="stage18-product-grid">
            <article>
              <span className="stage18-product-number">01</span>
              <h3>Inspect the surface</h3>
              <p>
                See what the submitted website serves, how its routes respond, and what is in scope.
              </p>
            </article>
            <article>
              <span className="stage18-product-number">02</span>
              <h3>Keep the record</h3>
              <p>
                Connect each conclusion to bounded evidence with explicit observed and derived
                provenance.
              </p>
            </article>
            <article>
              <span className="stage18-product-number">03</span>
              <h3>Make room for doubt</h3>
              <p>When evidence is incomplete or a challenge survives, uncertainty stays visible.</p>
            </article>
          </div>
        </section>

        <section className="stage18-roles" aria-labelledby="roles-title">
          <div className="stage18-section-intro stage18-section-intro-roles">
            <p className="stage18-eyebrow">After the record</p>
            <h2 id="roles-title">Specialists come after the evidence.</h2>
            <p>
              The CrossExam engine has offline role boundaries for Explorer, Breaker, Skeptic,
              Reproducer, and Judge. They are not part of the local HTTP scan and do not run here.
            </p>
          </div>
          <div className="stage18-role-list">
            <div>
              <span>Explorer</span>
              <small>proposes a claim</small>
            </div>
            <ChevronRight size={16} aria-hidden="true" />
            <div>
              <span>Breaker</span>
              <small>looks for a counterexample</small>
            </div>
            <ChevronRight size={16} aria-hidden="true" />
            <div>
              <span>Skeptic</span>
              <small>asks what is missing</small>
            </div>
            <ChevronRight size={16} aria-hidden="true" />
            <div>
              <span>Reproducer</span>
              <small>plans a permitted repeat</small>
            </div>
            <ChevronRight size={16} aria-hidden="true" />
            <div>
              <span>Judge</span>
              <small>keeps the result bounded</small>
            </div>
          </div>
          <div className="stage18-role-footnote">
            <span className="stage18-status-dot" aria-hidden="true" />
            <span>Fixture projection only. No model activity is implied here.</span>
          </div>
        </section>

        <section className="stage18-demo" id="demo" aria-labelledby="demo-title">
          <div>
            <p className="stage18-eyebrow">Open case file</p>
            <h2 id="demo-title">See the chain before you trust the conclusion.</h2>
          </div>
          <div className="stage18-demo-action">
            <p>
              Explore the clearly labeled fixture report and its evidence, challenges, and limits.
            </p>
            <Link className="stage18-button stage18-button-light" href="/report/demo">
              Open the demo report <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="stage18-footer">
        <Brand compact />
        <span>Evidence-backed website investigations.</span>
        <span>Local collection · Honest limits · No invented activity</span>
      </footer>
    </div>
  );
}
