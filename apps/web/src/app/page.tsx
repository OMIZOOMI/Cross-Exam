import { ScanForm } from "../components/scan-form";
import { VeyraWordmark } from "../components/ui";
import { VeyraHomeScene } from "../components/veyra-home/scene";
import "../components/veyra-home/home.css";

export default function HomePage() {
  return (
    <VeyraHomeScene>
      <div className="app-shell">
        <header className="app-header">
          <a className="brand-lockup" href="#main" aria-label="Veyra home">
            <VeyraWordmark />
          </a>
          <nav className="primary-nav" aria-label="Primary navigation">
            <a href="#showcase">Product</a>
            <a href="#how-it-works">How it works</a>
            <a href="#showcase">Demo</a>
          </nav>
          <div className="header-actions">
            <a className="header-cta" href="#scan">
              Scan a website
            </a>
            <button
              className="mobile-menu-toggle"
              type="button"
              aria-expanded="false"
              aria-controls="mobile-nav"
            >
              <span>Menu</span>
              <i aria-hidden="true"></i>
            </button>
          </div>
          <nav className="mobile-nav-panel" id="mobile-nav" aria-label="Mobile navigation" hidden>
            <a href="#showcase">
              Product <span>↘</span>
            </a>
            <a href="#how-it-works">
              How it works <span>↓</span>
            </a>
            <a href="#showcase">
              Demo <span>↗</span>
            </a>
            <a className="mobile-nav-cta" href="#scan">
              Scan a website
            </a>
          </nav>
        </header>
        <main className="prototype-shell" id="main">
          <section className="intro-rail" aria-labelledby="prototype-title">
            <div className="hero-atmosphere" aria-hidden="true">
              <span className="hero-atmosphere-orb hero-atmosphere-orb-a"></span>
              <span className="hero-atmosphere-orb hero-atmosphere-orb-b"></span>
              <span className="hero-atmosphere-ribbon"></span>
            </div>
            <div className="hero-copy">
              <p className="eyebrow">
                <span className="eyebrow-line"></span>Evidence-backed website investigations
              </p>
              <h1 id="prototype-title">
                <span className="hero-line">Your website says</span>
                <span className="hero-line">
                  it works.{" "}
                  <em>
                    Prove it<span className="hero-full-stop">.</span>
                  </em>
                </span>
              </h1>
              <p className="intro-copy">
                {" "}
                Discover what happens beneath the surface. Follow the evidence. Understand what
                needs attention.{" "}
              </p>
              <div className="hero-actions">
                <a className="hero-button hero-button-primary" href="#scan">
                  Scan a website
                </a>
                <a className="hero-button hero-button-secondary" href="#showcase">
                  Explore the demo
                </a>
              </div>
            </div>
          </section>
          <section className="veyra-scan" id="scan" aria-labelledby="veyra-scan-title">
            <div>
              <h2 id="veyra-scan-title">Scan a website</h2>
              <p>Enter a public website address to see what Veyra finds.</p>
            </div>
            <div>
              <ScanForm />
              <a className="text-link" href="/report/demo">
                See the demo case <span aria-hidden="true">↗</span>
              </a>
            </div>
          </section>
          <section
            className="stage-scroll"
            id="showcase"
            aria-label="Scroll-driven Veyra website cross-section"
          >
            <div className="stage-sticky">
              <div className="stage-layout">
                <section className="stage-frame">
                  <div className="stage-frame-topline">
                    <div className="stage-title">
                      <strong id="stage-state" aria-live="polite">
                        The visible surface
                      </strong>
                    </div>
                  </div>
                  <div
                    className="viewport"
                    id="viewport"
                    role="application"
                    aria-label="3D scene. Drag or use the arrow keys to orbit. Scroll to reveal the layers."
                  >
                    <div className="viewport-vignette" aria-hidden="true"></div>
                    <div className="viewport-grid" aria-hidden="true"></div>
                    <div className="world" id="world">
                      <div className="trace-layer" id="trace-layer" aria-hidden="true"></div>
                      <article
                        className="layer layer-1"
                        data-layer="1"
                        data-layer-title="Visible website"
                        data-layer-copy="The surface people see: navigation, content, and the Pricing CTA."
                        tabIndex={-1}
                        aria-label="Layer 1: visible website. It becomes interactive during the Challenge stage."
                      >
                        <div className="layer-surface"></div>
                        <div className="layer-header">
                          <span className="layer-number">01</span>
                          <span className="layer-name">VISIBLE WEBSITE</span>
                          <span className="layer-tag">RENDERED UI</span>
                        </div>
                        <div className="browser-chrome subdued">
                          <span className="browser-dots">
                            <i></i>
                            <i></i>
                            <i></i>
                          </span>
                          <span className="address-bar">veyralabs.test / overview</span>
                          <span className="browser-lock">⌁</span>
                        </div>
                        <nav className="site-nav subdued" aria-label="Demo site navigation">
                          <strong>
                            VESSEL<span>/08</span>
                          </strong>
                          <div>
                            <span>Platform</span>
                            <span>Methods</span>
                            <span>About</span>
                          </div>
                          <span className="nav-avatar">OM</span>
                        </nav>
                        <div className="surface-rule subdued"></div>
                        <div className="layer1-hero subdued">
                          <p className="micro-label">A calmer operating layer</p>
                          <h2>
                            Your website
                            <br />
                            <em>says it works.</em>
                          </h2>
                          <p className="layer1-copy">
                            One command center for the work that keeps your teams moving.
                          </p>
                          <button className="pricing-cta focus-node" id="pricing-cta" type="button">
                            View pricing <span>↗</span>
                          </button>
                        </div>
                        <div className="layer1-aside subdued">
                          <p className="micro-label">Live workspace</p>
                          <div className="metric-row">
                            <strong>04</strong>
                            <span>active surfaces</span>
                          </div>
                          <div className="metric-row">
                            <strong>18ms</strong>
                            <span>median response</span>
                          </div>
                          <div className="mini-line-chart">
                            <i></i>
                            <i></i>
                            <i></i>
                            <i></i>
                            <i></i>
                            <i></i>
                            <i></i>
                          </div>
                        </div>
                        <div className="product-card subdued focus-node" id="product-card">
                          <div className="product-card-top">
                            <span>SKU-01</span>
                            <span className="product-dot"></span>
                          </div>
                          <strong>Catalog intelligence</strong>
                          <span>Synced just now</span>
                          <div className="product-card-foot">
                            <span>Open record</span>
                            <span>↗</span>
                          </div>
                        </div>
                        <div className="layer1-footer subdued">
                          <span>© 2026 Vessel</span>
                          <span>Built for clear work</span>
                          <span>→</span>
                        </div>
                        <div className="anchor anchor-pricing" data-node="pricingBtn">
                          <span></span>
                          <b>CTA</b>
                        </div>
                        <div className="anchor anchor-product" data-node="productCard">
                          <span></span>
                          <b>SKU-01</b>
                        </div>
                      </article>
                      <article
                        className="layer layer-2"
                        data-layer="2"
                        data-layer-title="DOM & components"
                        data-layer-copy="The mounted structure that gives each visible element its place and behavior."
                        tabIndex={-1}
                        aria-label="Layer 2: DOM and components. It becomes interactive during the Challenge stage."
                      >
                        <div className="layer-surface"></div>
                        <div className="layer-header">
                          <span className="layer-number">02</span>
                          <span className="layer-name">DOM &amp; COMPONENTS</span>
                          <span className="layer-tag">STRUCTURE</span>
                        </div>
                        <div className="code-ruler subdued">
                          <span>01</span>
                          <span>08</span>
                          <span>16</span>
                          <span>24</span>
                          <span>32</span>
                          <span>40</span>
                        </div>
                        <div className="dom-tree subdued">
                          <span className="tree-root">&lt;AppShell&gt;</span>
                          <span className="tree-branch branch-one">├─ &lt;Navbar /&gt;</span>
                          <span className="tree-branch branch-two">├─ &lt;HeroSection&gt;</span>
                          <span className="tree-branch branch-three">
                            │ └─ &lt;PricingButton&gt;
                          </span>
                          <span className="tree-branch branch-four">└─ &lt;ProductGrid&gt;</span>
                          <span className="tree-branch branch-five">
                            {" "}
                            └─ &lt;ProductCard id="01" /&gt;
                          </span>
                        </div>
                        <div className="component-box navbar-box subdued">
                          <span>Navbar</span>
                          <b>&lt;Navbar /&gt;</b>
                          <small>3 children</small>
                        </div>
                        <div className="component-box hero-box subdued">
                          <span>HeroSection</span>
                          <b>children: 4</b>
                          <small>rendered</small>
                        </div>
                        <div className="component-box pricing-box focus-node">
                          <span>PricingButton</span>
                          <b>onClick → route</b>
                          <small>listener fired ✓</small>
                        </div>
                        <div className="component-box product-box subdued">
                          <span>ProductCard</span>
                          <b>id="sku-01"</b>
                          <small>mounted ✓</small>
                        </div>
                        <div className="dom-footer subdued">
                          <span className="code-accent">const</span> page ={" "}
                          <span className="code-accent">&lt;Vessel /&gt;</span>
                          <span className="cursor-blink"></span>
                        </div>
                        <div className="anchor anchor-pricing" data-node="pricingDom">
                          <span></span>
                          <b>&lt;PricingButton&gt;</b>
                        </div>
                        <div className="anchor anchor-product" data-node="productDom">
                          <span></span>
                          <b>&lt;ProductCard&gt;</b>
                        </div>
                      </article>
                      <article
                        className="layer layer-3"
                        data-layer="3"
                        data-layer-title="Routes & resources"
                        data-layer-copy="The map of destinations and assets that the interface expects to exist."
                        tabIndex={-1}
                        aria-label="Layer 3: routes and resources. It becomes interactive during the Challenge stage."
                      >
                        <div className="layer-surface"></div>
                        <div className="layer-header">
                          <span className="layer-number">03</span>
                          <span className="layer-name">ROUTES &amp; RESOURCES</span>
                          <span className="layer-tag">MAP</span>
                        </div>
                        <div className="route-summary subdued">
                          <span className="summary-pulse"></span>
                          <span>12 routes indexed</span>
                          <span>·</span>
                          <span>02 redirects</span>
                        </div>
                        <div className="route-table subdued">
                          <div className="route-table-head">
                            <span>METHOD</span>
                            <span>PATH</span>
                            <span>STATE</span>
                          </div>
                          <div className="route-row route-broken focus-node">
                            <span className="method">GET</span>
                            <strong>/pricing-v2</strong>
                            <span className="route-state route-state-bad">missing</span>
                          </div>
                          <div className="route-row route-valid focus-node">
                            <span className="method">GET</span>
                            <strong>/pricing</strong>
                            <span className="route-state route-state-good">active</span>
                          </div>
                          <div className="route-row">
                            <span className="method">GET</span>
                            <strong>/overview</strong>
                            <span className="route-state">active</span>
                          </div>
                          <div className="route-row">
                            <span className="method">GET</span>
                            <strong>/about</strong>
                            <span className="route-state">active</span>
                          </div>
                        </div>
                        <div className="resource-card subdued focus-node">
                          <span className="resource-type">JSON RESOURCE</span>
                          <strong>/assets/catalog.json</strong>
                          <span>18.4 kb · cached</span>
                          <i className="resource-spark"></i>
                        </div>
                        <div className="redirect-note subdued">
                          <span>redirect table</span>
                          <strong>/pricing-old → /pricing</strong>
                          <small>valid target</small>
                        </div>
                        <div className="route-footer subdued">
                          <span>route manifest v2.4</span>
                          <span>last indexed 14:03:02</span>
                        </div>
                        <div className="anchor anchor-broken-route" data-node="brokenRoute">
                          <span></span>
                          <b>/pricing-v2</b>
                        </div>
                        <div className="anchor anchor-valid-route" data-node="validRoute">
                          <span></span>
                          <b>/pricing</b>
                        </div>
                        <div className="anchor anchor-resource" data-node="catalogRes">
                          <span></span>
                          <b>catalog.json</b>
                        </div>
                      </article>
                      <article
                        className="layer layer-4"
                        data-layer="4"
                        data-layer-title="Requests & dependencies"
                        data-layer-copy="The dispatch layer: what the interface asks for and which dependencies it carries."
                        tabIndex={-1}
                        aria-label="Layer 4: requests and dependencies. It becomes interactive during the Challenge stage."
                      >
                        <div className="layer-surface"></div>
                        <div className="layer-header">
                          <span className="layer-number">04</span>
                          <span className="layer-name">REQUESTS &amp; DEPENDENCIES</span>
                          <span className="layer-tag">DISPATCH</span>
                        </div>
                        <div className="request-console subdued">
                          <span className="console-led"></span>
                          <span>local request console</span>
                          <span className="console-time">t+142ms</span>
                        </div>
                        <div className="request-card request-broken focus-node">
                          <div className="request-card-title">
                            <span className="method method-get">GET</span>
                            <strong>/api/v2/pricing</strong>
                            <span className="request-latency">+09ms</span>
                          </div>
                          <div className="request-url">
                            https://api.veyralabs.test<span>/api/v2/pricing</span>
                          </div>
                          <div className="request-meta">
                            <span>initiator: PricingButton</span>
                            <span className="request-status request-status-bad">pending → 404</span>
                          </div>
                        </div>
                        <div className="dependency-card dependency-auth challenge-node">
                          <div className="dependency-icon">⌁</div>
                          <div>
                            <span>AUTH HEADER</span>
                            <strong>Bearer · valid</strong>
                            <small>signature accepted</small>
                          </div>
                          <b className="check-mark">✓</b>
                        </div>
                        <div className="request-card request-healthy subdued focus-node">
                          <div className="request-card-title">
                            <span className="method method-get">GET</span>
                            <strong>/api/v1/catalog</strong>
                            <span className="request-latency">+18ms</span>
                          </div>
                          <div className="request-meta">
                            <span>initiator: ProductCard</span>
                            <span className="request-status request-status-good">200 OK</span>
                          </div>
                        </div>
                        <div className="dependency-strip subdued">
                          <span>tls 1.3</span>
                          <span>keep-alive</span>
                          <span>cache-control</span>
                          <span>trace-id: 7A1F</span>
                        </div>
                        <div className="anchor anchor-pricing-request" data-node="pricingReq">
                          <span></span>
                          <b>GET /api/v2/pricing</b>
                        </div>
                        <div className="anchor anchor-auth" data-node="authDep">
                          <span></span>
                          <b>auth valid</b>
                        </div>
                        <div className="anchor anchor-catalog-request" data-node="catalogReq">
                          <span></span>
                          <b>GET /api/v1/catalog</b>
                        </div>
                      </article>
                      <article
                        className="layer layer-5"
                        data-layer="5"
                        data-layer-title="Responses & behavior"
                        data-layer-copy="What comes back, and how the visible page behaves when it does not resolve."
                        tabIndex={-1}
                        aria-label="Layer 5: responses and behavior. It becomes interactive during the Challenge stage."
                      >
                        <div className="layer-surface"></div>
                        <div className="layer-header">
                          <span className="layer-number">05</span>
                          <span className="layer-name">RESPONSES &amp; BEHAVIOR</span>
                          <span className="layer-tag">OUTCOME</span>
                        </div>
                        <div className="response-heading subdued">
                          <span>Observed response stream</span>
                          <span className="response-stream-dot"></span>
                        </div>
                        <div className="response-card response-bad focus-node">
                          <div className="response-code">404</div>
                          <div className="response-copy">
                            <span>HTTP NOT FOUND</span>
                            <strong>/api/v2/pricing</strong>
                            <small>route did not resolve</small>
                          </div>
                          <div className="response-mark">!</div>
                        </div>
                        <div className="behavior-note focus-node">
                          <span className="behavior-label">UI BEHAVIOR</span>
                          <strong>Silent failure</strong>
                          <small>surface remains unchanged</small>
                          <div className="behavior-bars">
                            <i></i>
                            <i></i>
                            <i></i>
                            <i></i>
                          </div>
                        </div>
                        <div className="response-card response-good subdued">
                          <div className="response-code">200</div>
                          <div className="response-copy">
                            <span>HTTP OK</span>
                            <strong>/api/v1/catalog</strong>
                            <small>18ms · payload returned</small>
                          </div>
                          <div className="response-mark">✓</div>
                        </div>
                        <div className="response-footer subdued">
                          <span>response body withheld</span>
                          <span>observed path</span>
                        </div>
                        <div className="anchor anchor-error" data-node="error404">
                          <span></span>
                          <b>HTTP 404</b>
                        </div>
                        <div className="anchor anchor-ok" data-node="ok200">
                          <span></span>
                          <b>HTTP 200</b>
                        </div>
                      </article>
                      <div className="inspection-ring" id="inspection-ring" aria-hidden="true">
                        <span></span>
                      </div>
                      <div
                        className="inspection-callout"
                        id="inspection-callout"
                        aria-live="polite"
                      >
                        <div className="callout-kicker">
                          <span className="callout-pin"></span>VEYRA / INSPECTION
                        </div>
                        <strong id="callout-title">Evidence path located</strong>
                        <p id="callout-body">
                          Pricing CTA dispatched, but the request terminates at a missing route.
                        </p>
                        <div className="callout-evidence">
                          <span>OBSERVED</span>
                          <b>GET /api/v2/pricing → 404</b>
                        </div>
                        <div className="callout-recommendation">
                          <span>RECOMMENDED FIX</span>
                          <b>Update target prop → /pricing</b>
                        </div>
                      </div>
                      <div className="scene-cursor" id="scene-cursor" aria-hidden="true">
                        <svg className="cursor-pointer" viewBox="0 0 28 36" role="presentation">
                          <path d="M3.2 2.4 24.8 20l-10.1 1.2 5.4 10.9-4.2 2.1-5.5-10.8-6.1 8.1Z"></path>
                        </svg>
                        <span className="cursor-trail"></span>
                      </div>
                    </div>
                  </div>
                </section>
                <aside
                  className="reading-rail inspector-panel"
                  id="inspector"
                  aria-labelledby="inspector-title"
                >
                  <div className="inspector-summary">
                    <span className="summary-step" id="inspector-step">
                      Stage 01 · Surface
                    </span>
                    <h2 id="inspector-title">
                      <span id="inspector-heading">A polished page, at first glance.</span>
                    </h2>
                    <p id="inspector-summary">
                      The link looks healthy from the front. Veyra follows the request underneath.
                    </p>
                  </div>
                  <div
                    className="inspector-layer-note"
                    id="inspector-layer-note"
                    aria-live="polite"
                  >
                    <div>
                      <small>Layer context</small>
                      <strong id="inspector-layer-title">
                        Select a layer to inspect its role.
                      </strong>
                      <p id="inspector-layer-copy" hidden></p>
                    </div>
                    <button
                      className="inspector-layer-reset"
                      id="inspector-layer-reset"
                      type="button"
                      hidden
                    >
                      Clear selection
                    </button>
                  </div>
                  <div className="inspector-evidence">
                    <small id="inspector-observed-label">Observed path</small>
                    <strong id="inspector-observed">
                      Pricing link → GET /api/v2/pricing → HTTP 404
                    </strong>
                    <p id="inspector-conclusion">
                      No route or response is assigned from the surface alone.
                    </p>
                  </div>
                  <details className="hypothesis-details" id="hypothesis-details">
                    <summary>
                      <span>Candidate checks</span>
                      <span className="details-action">View details</span>
                    </summary>
                    <div className="hypothesis-list">
                      <article className="hypothesis-card" id="hypothesis-click">
                        <div className="hypothesis-icon">A</div>
                        <div className="hypothesis-copy">
                          <strong>Broken click listener</strong>
                          <span>&lt;PricingButton onClick&gt;</span>
                        </div>
                        <span className="hypothesis-state" id="hypothesis-click-state">
                          PENDING
                        </span>
                      </article>
                      <article className="hypothesis-card" id="hypothesis-auth">
                        <div className="hypothesis-icon">B</div>
                        <div className="hypothesis-copy">
                          <strong>Rejected auth header</strong>
                          <span>Bearer token dependency</span>
                        </div>
                        <span className="hypothesis-state" id="hypothesis-auth-state">
                          PENDING
                        </span>
                      </article>
                    </div>
                  </details>
                  <div className="inspector-recommendation">
                    <strong id="inspector-recommendation">
                      Suggested fix: update the target to <code>/pricing</code>, then verify the
                      response.
                    </strong>
                  </div>
                </aside>
              </div>
            </div>
          </section>
        </main>
        <section className="story-panel story-panel-dark" aria-labelledby="story-title">
          <div className="story-panel-copy">
            <p className="story-kicker">
              <span></span>THE INVISIBLE CHAIN
            </p>
            <h2 id="story-title">
              A smooth surface can hide a <em>complex truth.</em>
            </h2>
            <p>
              Veyra turns the unseen relationship between interface, route, request, and response
              into something people can understand.
            </p>
          </div>
          <ol className="proof-loop" aria-label="Veyra investigation sequence">
            <svg
              className="proof-connectors proof-connectors-desktop"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="proof-arrow-desktop"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z"></path>
                </marker>
              </defs>
              <path d="M 47 25 H 53" markerEnd="url(#proof-arrow-desktop)"></path>
              <path d="M 76 46 V 49 H 24 V 52" markerEnd="url(#proof-arrow-desktop)"></path>
              <path d="M 47 75 H 53" markerEnd="url(#proof-arrow-desktop)"></path>
            </svg>
            <svg
              className="proof-connectors proof-connectors-mobile"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="proof-arrow-mobile"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z"></path>
                </marker>
              </defs>
              <path d="M 50 19 V 31" markerEnd="url(#proof-arrow-mobile)"></path>
              <path d="M 50 44 V 56" markerEnd="url(#proof-arrow-mobile)"></path>
              <path d="M 50 69 V 81" markerEnd="url(#proof-arrow-mobile)"></path>
            </svg>
            <li>
              <span>01</span>
              <strong>Evidence</strong>
              <small>what is observable</small>
            </li>
            <li>
              <span>02</span>
              <strong>Claim</strong>
              <small>what might explain it</small>
            </li>
            <li>
              <span>03</span>
              <strong>Challenge</strong>
              <small>what does not hold</small>
            </li>
            <li>
              <span>04</span>
              <strong>Verdict</strong>
              <small>what the evidence supports</small>
            </li>
          </ol>
        </section>
        <section className="layer-explainer" id="how-it-works" aria-labelledby="method-title">
          <div className="method-heading">
            <p className="eyebrow">
              <span className="eyebrow-line"></span>How Veyra follows the thread
            </p>
            <h2 id="method-title">
              A website is more than what it <em>shows.</em>
            </h2>
            <p>
              Follow one Pricing click from the rendered surface to the response that shaped the
              experience.
            </p>
          </div>
          <ol
            className="layer-flow"
            aria-label="The Pricing walkthrough from interface to response"
          >
            <li className="flow-node flow-node-ui">
              <div className="flow-icon" aria-hidden="true">
                <span className="mini-browser">
                  <i></i>
                  <b></b>
                  <em></em>
                </span>
              </div>
              <span className="flow-step">01 · SURFACE</span>
              <h3>Visible UI</h3>
              <p>What the visitor sees first.</p>
              <small>View pricing</small>
            </li>
            <li className="flow-arrow" aria-hidden="true">
              →
            </li>
            <li className="flow-node flow-node-dom">
              <div className="flow-icon" aria-hidden="true">
                <span className="mini-component">
                  <i></i>
                  <i></i>
                  <i></i>
                </span>
              </div>
              <span className="flow-step">02 · STRUCTURE</span>
              <h3>DOM &amp; components</h3>
              <p>What is mounted behind the surface.</p>
              <small>&lt;PricingButton onClick&gt;</small>
            </li>
            <li className="flow-arrow" aria-hidden="true">
              →
            </li>
            <li className="flow-node flow-node-route">
              <div className="flow-icon" aria-hidden="true">
                <span className="mini-route">
                  <i>/pricing-v2</i>
                  <b>→ /pricing</b>
                </span>
              </div>
              <span className="flow-step">03 · DESTINATION</span>
              <h3>Routes &amp; resources</h3>
              <p>Where the interface expects to go.</p>
              <small>missing · /pricing is active</small>
            </li>
            <li className="flow-arrow" aria-hidden="true">
              →
            </li>
            <li className="flow-node flow-node-request">
              <div className="flow-icon" aria-hidden="true">
                <span className="mini-request">
                  <b>GET</b>
                  <i>↗</i>
                </span>
              </div>
              <span className="flow-step">04 · DISPATCH</span>
              <h3>Requests &amp; dependencies</h3>
              <p>What the click sends downstream.</p>
              <small>auth accepted · request sent</small>
            </li>
            <li className="flow-arrow" aria-hidden="true">
              →
            </li>
            <li className="flow-node flow-node-response">
              <div className="flow-icon" aria-hidden="true">
                <span className="mini-response">404</span>
              </div>
              <span className="flow-step">05 · OUTCOME</span>
              <h3>Responses &amp; behavior</h3>
              <p>What comes back and shapes the page.</p>
              <small>route did not resolve</small>
            </li>
          </ol>
        </section>
        <section className="story-panel story-panel-light" aria-labelledby="boundary-title">
          <div className="boundary-statement">
            <span className="story-kicker">
              <span></span>BUILT FOR CLARITY
            </span>
            <h2 id="boundary-title">
              Make the invisible <em>legible.</em>
            </h2>
          </div>
          <div className="boundary-copy">
            <p>
              Veyra does not pretend to repair what it has not proven. It follows available
              evidence, names uncertainty, and leaves the next action clear.
            </p>
            <span className="boundary-pill">
              <i></i> EVIDENCE BEFORE ACTION
            </span>
          </div>
        </section>
        <footer className="app-footer">
          <span>VEYRA</span>
          <span>Evidence over assumption</span>
          <span className="footer-credit">Made by Om Sawkare</span>
        </footer>
      </div>
    </VeyraHomeScene>
  );
}
