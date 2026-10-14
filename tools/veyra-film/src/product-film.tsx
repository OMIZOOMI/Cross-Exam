import { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, useCurrentFrame } from "remotion";
import { clamp, DEMO, depthAt, ease, FILM, LAYERS, shotAt, trailPositionAt } from "./story";

const C = {
  ink: "#111211",
  paper: "#f0eadc",
  muted: "#aaa99d",
  orange: "#ff6b2c",
  blue: "#75b8dc",
  red: "#ee6e59",
  amber: "#e2b764",
  green: "#99c5aa",
  line: "#454b47",
};
const mono = "IBM Plex Mono";
const display = "Barlow Condensed";
type Point = { x: number; y: number };

function Label({
  x,
  y,
  children,
  color = C.muted,
  size = 17,
}: {
  x: number;
  y: number;
  children: React.ReactNode;
  color?: string;
  size?: number;
}) {
  return (
    <text x={x} y={y} fill={color} fontFamily={mono} fontSize={size} letterSpacing={1}>
      {children}
    </text>
  );
}
function PlaneContents({ layer, t }: { layer: number; t: number }) {
  if (layer === 0)
    return (
      <>
        <rect width="700" height="390" fill={C.paper} />
        <rect width="700" height="28" fill="#d9d4c8" />
        {[15, 27, 39].map((x) => (
          <circle key={x} cx={x} cy="14" r="3" fill="#888c82" />
        ))}
        <text x="70" y="19" fontFamily={mono} fontSize="9" fill="#60675f">
          FIELDWORK / A SYNTHETIC WEBSITE
        </text>
        <text x="30" y="72" fontFamily={display} fontSize="30" fontWeight="700" fill={C.ink}>
          FIELDWORK®
        </text>
        <text x="464" y="64" fontFamily={mono} fontSize="9" fill="#61665e">
          WORK STUDIO CONTACT
        </text>
        <path d="M30 95 H670" stroke="#a6aa9e" />
        <text x="30" y="136" fontFamily={mono} fontSize="10" fill="#656b61">
          DESIGN × ENGINEERING
        </text>
        <text x="28" y="196" fontFamily={display} fontSize="64" fontWeight="700" fill={C.ink}>
          MADE TO
        </text>
        <text x="28" y="258" fontFamily={display} fontSize="64" fontWeight="700" fill={C.ink}>
          LOOK CLOSER.
        </text>
        <rect x="30" y="294" width="125" height="32" fill={C.ink} />
        <text x="45" y="315" fontFamily={mono} fontSize="9" fill={C.paper}>
          EXPLORE WORK ↗
        </text>
        <rect x="399" y="115" width="270" height="235" fill="#8a9181" />
        <path d="M445 350 V202 C445 144 625 144 625 202 V350" fill="#b7bead" />
        <path d="M489 350 V221 C489 181 581 181 581 221 V350" fill="#202d28" />
        <path d="M399 350 L536 273 L669 350" fill="#c6c5b2" />
        <path d="M399 350 H669 M402 367 H669" stroke="#707766" />
        <text x="30" y="370" fontFamily={mono} fontSize="9" fill="#656b61">
          01 / SURFACE STUDIES
        </text>
      </>
    );
  if (layer === 1)
    return (
      <g stroke={C.blue} fill="none" strokeWidth="1.3">
        <rect x="28" y="48" width="644" height="48" />
        <rect x="28" y="117" width="343" height="224" />
        <rect x="399" y="117" width="273" height="224" />
        {[155, 200, 246, 293].map((y) => (
          <path key={y} d={`M49 ${y} H345`} opacity="0.45" />
        ))}
        <path
          d="M30 364 H672 M75 30 V375 M375 30 V375 M637 30 V375"
          opacity="0.28"
          strokeDasharray="4 7"
        />
        <Label x={52} y={76} color={C.blue} size={14}>
          HEADER / NAV
        </Label>
        <Label x={435} y={215} color={C.blue} size={15}>
          HERO / IMG
        </Label>
        <circle cx="535" cy="250" r="16" />
      </g>
    );
  if (layer === 2)
    return (
      <g fill="none" stroke={C.muted} strokeWidth="1.3">
        <path d="M70 85 H630 V315 H70 Z M70 144 H630 M265 144 V315 M442 144 V315" />
        <path d="M110 210 H220 M292 210 H402 M470 210 H596" strokeDasharray="6 7" />
        <Label x={98} y={120} size={15}>
          PAGE / HOME
        </Label>
        <Label x={98} y={186} size={14}>
          NAV
        </Label>
        <Label x={292} y={186} size={14}>
          COPY
        </Label>
        <Label x={470} y={186} color={C.blue} size={14}>
          HERO
        </Label>
        <path d="M532 232 V278 H351 V330" stroke={C.blue} strokeWidth="2.5" />
        <circle cx="535" cy="250" r="14" stroke={C.blue} />
      </g>
    );
  if (layer === 3)
    return (
      <g>
        {[0, 1, 2].map((n) => (
          <g key={n} transform={`translate(${60 + n * 200},95)`}>
            <path
              d="M0 0 H118 L154 36 V170 H0 Z M118 0 V36 H154"
              fill="#242a26"
              stroke={n === 2 && t >= 12 ? C.red : C.line}
              strokeWidth="2"
            />
            <Label x={15} y={85} color={n === 2 && t >= 12 ? C.red : C.muted} size={22}>
              {["CSS", "JS", "IMG"][n]}
            </Label>
            <path d="M15 108 H133 M15 123 H104 M15 138 H120" stroke={C.line} />
          </g>
        ))}
        <Label x={60} y={315} size={14}>
          DECLARED ASSETS / REFERENCED, NOT REPAIRED
        </Label>
        <circle
          cx="535"
          cy="250"
          r="18"
          fill={C.ink}
          stroke={t >= 12 ? C.red : C.blue}
          strokeWidth="3"
        />
      </g>
    );
  if (layer === 4)
    return (
      <g fill="none" stroke={C.line}>
        {[105, 182, 260].map((y, n) => (
          <g key={y}>
            <path d={`M60 ${y} H640 M60 ${y + 42} H640`} />
            <Label x={78} y={y + 27} size={16}>
              GET
            </Label>
            <Label x={160} y={y + 27} size={14}>
              {["/styles/main.css", "/scripts/site.js", "/assets/hero-v1.webp"][n]}
            </Label>
            <Label x={580} y={y + 27} color={n === 2 && t >= 12 ? C.red : C.muted} size={19}>
              {n === 2 && t >= 12 ? "404" : "200"}
            </Label>
          </g>
        ))}
        <path d="M535 220 V255" stroke={C.red} strokeWidth="3" />
        <circle cx="535" cy="250" r="12" fill={C.ink} stroke={C.red} />
        <Label x={70} y={354} size={12}>
          RUNTIME RELATION / PAGE STILL RENDERS
        </Label>
      </g>
    );
  return (
    <g fill="none" stroke={C.line}>
      {[60, 130, 200, 270, 340, 410, 480, 550, 620].map((x) => (
        <path key={x} d={`M${x} 70 V325`} opacity="0.38" />
      ))}
      {[92, 162, 232, 302].map((y) => (
        <path key={y} d={`M60 ${y} H640`} opacity="0.38" />
      ))}
      <path d="M90 245 H351 L420 185 H580" stroke={C.blue} strokeWidth="3" />
      <circle cx="535" cy="250" r="19" fill={C.ink} stroke={C.blue} strokeWidth="3" />
      <Label x={74} y={126} color={C.blue} size={16}>
        E-01 / RESOURCE STATUS
      </Label>
      <Label x={74} y={196} color={C.blue} size={16}>
        E-02 / DECLARED REFERENCE
      </Label>
      <Label x={74} y={338} size={12}>
        DEMO RECORD / NEVER LIVE EVIDENCE
      </Label>
    </g>
  );
}

export function VeyraFilm() {
  const frame = useCurrentFrame(),
    t = frame / FILM.fps;
  const [fontHandle] = useState(() => delayRender("Bundled film fonts"));
  useEffect(() => {
    Promise.all([
      document.fonts.load('700 100px "Barlow Condensed"'),
      document.fonts.load('400 16px "IBM Plex Mono"'),
    ]).then(() => continueRender(fontHandle));
  }, [fontHandle]);
  const depth = depthAt(t),
    shot = shotAt(t);
  const phase = ease(t, shot.start, shot.start + 0.5) * (1 - ease(t, shot.end - 0.25, shot.end));
  const camera = Math.sin(clamp((t - 8) / 22) * Math.PI) * 35;
  const a = 1.1 - depth * 0.16,
    b = depth * -0.13,
    c = depth * 0.38,
    d = 1.1 - depth * 0.57;
  const origin = (i: number) => ({
    x: 990 - i * depth * 49 + camera,
    y: 292 + i * depth * 91 - depth * 45,
  });
  const project = (i: number, x: number, y: number) => ({
    x: origin(i).x + a * x + c * y,
    y: origin(i).y + b * x + d * y,
  });
  const nodes = LAYERS.map((_, i) => project(i, 535, 250));
  const trail = nodes.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
  const inspection = ease(t, 16.4, 20.9),
    selected = t >= 16;
  const active = Math.min(5, Math.floor(inspection * 6));
  const worldAlpha = 1 - ease(t, 33, 33.45);
  const problem = t >= 12 && t < 26;
  const pulse = trailPositionAt(t);
  const index = Math.min(4, Math.floor(pulse));
  const point: Point = {
    x:
      (nodes[index]?.x ?? 0) +
      ((nodes[index + 1]?.x ?? 0) - (nodes[index]?.x ?? 0)) * (pulse - index),
    y:
      (nodes[index]?.y ?? 0) +
      ((nodes[index + 1]?.y ?? 0) - (nodes[index]?.y ?? 0)) * (pulse - index),
  };
  const scanOrigin = origin(active);
  return (
    <AbsoluteFill style={{ backgroundColor: C.ink }}>
      <svg
        width={FILM.width}
        height={FILM.height}
        viewBox="0 0 1920 1080"
        role="img"
        aria-label="Veyra synthetic website cross-section film"
      >
        <defs>
          <pattern id="paper-grid" width="80" height="80" patternUnits="userSpaceOnUse">
            <path d="M80 0 H0 V80" stroke="#d9e3d3" opacity="0.025" fill="none" />
          </pattern>
          <radialGradient id="light">
            <stop stopColor="#39443a" stopOpacity="0.4" />
            <stop offset="1" stopColor={C.ink} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="scan" x1="0" x2="1">
            <stop stopColor={C.orange} stopOpacity="0.03" />
            <stop offset="0.8" stopColor={C.orange} stopOpacity="0.05" />
            <stop offset="1" stopColor={C.orange} stopOpacity="0.35" />
          </linearGradient>
        </defs>
        <rect width="1920" height="1080" fill="url(#paper-grid)" />
        <ellipse cx="1380" cy="680" rx="700" ry="510" fill="url(#light)" />
        <path d="M76 110 H1844 M76 1012 H1844" stroke={C.line} />
        <Label x={80} y={77} color={C.paper} size={23}>
          V / VEYRA
        </Label>
        <Label x={1175} y={77} color={C.muted} size={17}>
          {DEMO.source}
        </Label>
        <g opacity={worldAlpha}>
          <g opacity={phase} transform={`translate(0,${(1 - phase) * 22})`}>
            <Label x={84} y={186} color={C.orange} size={16}>
              {shot.label}
            </Label>
            {shot.lines.map((line, i) => (
              <text
                key={line}
                x="78"
                y={323 + i * 122}
                fontFamily={display}
                fontWeight="700"
                fontSize={shot.start === 30 ? 94 : shot.start === 4 ? 109 : 121}
                letterSpacing="-1.5"
                fill={i === 1 ? "none" : C.paper}
                stroke={i === 1 ? C.paper : "none"}
                strokeWidth="1.2"
              >
                {line}
              </text>
            ))}
            <foreignObject x="84" y="735" width="560" height="108">
              <div style={{ color: C.muted, fontFamily: mono, fontSize: 21, lineHeight: 1.55 }}>
                {shot.note}
              </div>
            </foreignObject>
          </g>
          <g opacity={depth * 0.75}>
            {[
              [35, 45],
              [660, 45],
              [35, 360],
              [660, 360],
            ].map(([x = 0, y = 0]) => (
              <path
                key={`${x}-${y}`}
                d={LAYERS.map((_, i) => {
                  const p = project(i, x, y);
                  return `${i ? "L" : "M"}${p.x},${p.y}`;
                }).join(" ")}
                fill="none"
                stroke={C.line}
                strokeDasharray="5 7"
              />
            ))}
          </g>
          {[5, 4, 3, 2, 1, 0].map((i) => {
            const o = origin(i),
              p = project(i, 0, 18);
            const dim = t >= 26 && i !== 2 && i !== 3 && i !== 4 ? 0.28 : 1;
            return (
              <g key={i} opacity={i === 0 ? Math.max(0.42, dim) : depth * dim}>
                <g transform={`matrix(${a} ${b} ${c} ${d} ${o.x} ${o.y})`}>
                  <rect
                    x="5"
                    y="8"
                    width="700"
                    height="390"
                    fill="#060807"
                    stroke="#303730"
                    strokeWidth="1.5"
                  />
                  <rect
                    width="700"
                    height="390"
                    fill={i === 0 ? C.paper : "#19201b"}
                    stroke={i === 0 ? C.paper : i === 3 && problem ? C.red : C.line}
                    strokeWidth="1.5"
                  />
                  <PlaneContents layer={i} t={t} />
                  {selected && i <= active && t < 26 && (
                    <rect
                      x="1"
                      y="1"
                      width="698"
                      height="388"
                      fill="none"
                      stroke={C.orange}
                      strokeWidth="2"
                    />
                  )}
                </g>
                <g opacity={depth}>
                  <path d={`M${p.x - 98} ${p.y} H${p.x - 9}`} stroke={C.line} />
                  <Label
                    x={p.x - 145}
                    y={p.y - 14}
                    size={14}
                    color={selected && i <= active ? C.orange : C.muted}
                  >
                    {`${i + 1}`.padStart(2, "0")} / {LAYERS[i]}
                  </Label>
                </g>
              </g>
            );
          })}
          <path
            d={trail}
            fill="none"
            stroke={problem ? C.red : selected ? C.blue : C.muted}
            strokeWidth={selected ? 3 : 1.5}
            opacity={depth * (t >= 8 ? 0.9 : 0.32)}
            strokeDasharray={t < 8 ? "6 12" : undefined}
          />
          {nodes.map((p, i) => (
            <g key={LAYERS[i]} opacity={depth}>
              <circle
                cx={p.x}
                cy={p.y}
                r={selected ? 8 : 5}
                fill={C.ink}
                stroke={problem && i >= 3 ? C.red : C.blue}
                strokeWidth="2"
              />
              {selected && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="18"
                  fill="none"
                  stroke={i <= active ? C.orange : C.line}
                />
              )}
            </g>
          ))}
          {(problem || (t >= 26 && t < 30)) && (
            <g opacity={Math.sin(clamp((t - (t < 16 ? 12 : 26)) / 4) * Math.PI)}>
              <circle
                cx={point.x}
                cy={point.y}
                r="23"
                fill="none"
                stroke={problem ? C.red : C.orange}
                opacity="0.4"
              />
              <circle cx={point.x} cy={point.y} r="7" fill={problem ? C.red : C.orange} />
            </g>
          )}
          {t >= 16 && t < 22 && (
            <g transform={`matrix(${a} ${b} ${c} ${d} ${scanOrigin.x} ${scanOrigin.y + 15})`}>
              <rect
                x="-20"
                y="-24"
                width="745"
                height="438"
                fill="url(#scan)"
                stroke={C.orange}
                strokeWidth="2"
              />
              <path
                d="M-20 -40 V-24 H-40 M745 -40 V-24 H765 M-20 430 V450 H-40 M745 430 V450 H765"
                fill="none"
                stroke={C.orange}
                strokeWidth="3"
              />
              <Label x={12} y={-41} color={C.orange} size={20}>
                VEYRA / INSPECTION FIELD
              </Label>
            </g>
          )}
          {t >= 19 && t < 22 && (
            <g opacity={ease(t, 19, 19.6)}>
              <path d={`M${nodes[5]?.x} ${nodes[5]?.y} H1800 V930`} stroke={C.blue} fill="none" />
              <Label x={1430} y={961} color={C.blue} size={16}>
                E-01 / 404 + E-02 / REFERENCE
              </Label>
            </g>
          )}
          {t >= 22 && t < 26 && (
            <g opacity={ease(t, 22, 22.35)}>
              <rect x="750" y="780" width="1080" height="206" fill={C.ink} stroke={C.line} />
              <Label x={780} y={817} color={C.blue} size={16}>
                DEMO OBSERVATION → EVIDENCE → CLAIM
              </Label>
              <Label x={780} y={852} color={C.paper} size={22}>
                {DEMO.claim}
              </Label>
              <path d="M778 868 H1610" stroke={C.muted} opacity={1 - ease(t, 23, 24)} />
              <g opacity={ease(t, 23, 23.4)}>
                <path d="M756 942 L840 896 H1804" stroke={C.amber} strokeWidth="2" fill="none" />
                <Label x={780} y={930} color={C.amber} size={17}>
                  CHALLENGE / {DEMO.challenge}
                </Label>
                <Label x={780} y={965} color={C.blue} size={15}>
                  RETAIN: THE DIRECT RESOURCE-STATUS PATH. CAUSAL CLAIM WITHDRAWN.
                </Label>
              </g>
            </g>
          )}
          {t >= 26 && t < 30 && (
            <g opacity={ease(t, 26, 26.4)}>
              <path d="M970 849 H1812" stroke={C.orange} strokeWidth="2" />
              <Label x={1000} y={897} color={C.orange} size={20}>
                HERO COMPONENT → STALE ASSET REFERENCE → 404
              </Label>
              <Label x={1000} y={934} color={C.muted} size={15}>
                RESPONSIBLE RELATIONSHIP / SYNTHETIC SYSTEM ONLY
              </Label>
            </g>
          )}
          {t >= 30 && t < 33 && (
            <g opacity={ease(t, 30, 30.3)}>
              <rect x="806" y="724" width="1008" height="246" fill={C.ink} stroke={C.line} />
              <Label x={837} y={772} color={C.green} size={20}>
                {DEMO.verdict}
              </Label>
              <Label x={837} y={814} color={C.paper} size={19}>
                WHAT / The referenced hero asset is unavailable.
              </Label>
              <Label x={837} y={854} color={C.paper} size={19}>
                WHY / The component points to an old asset path.
              </Label>
              <Label x={837} y={904} color={C.orange} size={19}>
                FIX / {DEMO.recommendation}
              </Label>
              <Label x={837} y={943} color={C.muted} size={13}>
                RECOMMENDATION ONLY / NO CODE WAS CHANGED
              </Label>
            </g>
          )}
        </g>
        {t >= 33 && (
          <g opacity={ease(t, 33.15, 33.5)}>
            <rect x="0" y="112" width="1920" height="897" fill={C.ink} />
            <text
              x="84"
              y="535"
              fill={C.paper}
              fontFamily={display}
              fontWeight="700"
              fontSize="415"
              letterSpacing="-10"
            >
              VEYRA
            </text>
            <path d="M1090 237 V899" stroke={C.orange} strokeWidth="3" />
            <text
              x="1170"
              y="440"
              fill={C.paper}
              fontFamily={display}
              fontWeight="700"
              fontSize="78"
            >
              YOUR WEBSITE
            </text>
            <text
              x="1170"
              y="524"
              fill="none"
              stroke={C.paper}
              strokeWidth="1"
              fontFamily={display}
              fontWeight="700"
              fontSize="78"
            >
              SAYS IT WORKS.
            </text>
            <text
              x="1165"
              y="692"
              fill={C.orange}
              fontFamily={display}
              fontWeight="700"
              fontSize="138"
            >
              PROVE IT.
            </text>
            <Label x={92} y={744} color={C.muted} size={20}>
              Evidence-backed website investigations.
            </Label>
            <Label x={92} y={880} color={C.muted} size={17}>
              INVESTIGATE. CHALLENGE. EXPLAIN.
            </Label>
          </g>
        )}
        <Label x={80} y={1048} size={15}>
          PRODUCT FILM / 35 SECONDS / SYNTHETIC SYSTEM
        </Label>
        <Label x={1547} y={1048} size={15}>
          {String(Math.min(35, Math.floor(t))).padStart(2, "0")} / 35 — VEYRA
        </Label>
        <path d={`M76 1012 H${76 + (1768 * t) / 35}`} stroke={C.orange} strokeWidth="2" />
      </svg>
    </AbsoluteFill>
  );
}
