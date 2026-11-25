// Motion and demo data from the approved standalone Veyra cross-section.
const DURATION = 10.8;
const LAYER_BASE_OPACITY = [1, 0.92, 0.9, 0.9, 0.94];
const ASSEMBLED_Z = [0, -10, -20, -30, -40];
const EXPLODED_Z = [0, -96, -192, -288, -384];

const NARRATIVE_STAGES = [
  {
    key: "surface",
    number: "01",
    label: "SURFACE",
    counter: "01 / 05",
    start: 0,
    end: 0.16,
    state: "The visible surface",
    focus: "A familiar website, before the reveal",
    inspector: {
      heading: "A polished page, at first glance.",
      summary: "The link looks healthy from the front. Veyra follows the request underneath.",
      conclusion: "No route or response is assigned from the surface alone.",
    },
    milestones: [{ at: 0, pathNodes: [], activeNodes: [] }],
    showEvidence: false,
    showHypotheses: false,
    showRecommendation: false,
    showBoundary: false,
    allowLayerExploration: false,
  },
  {
    key: "interaction",
    number: "02",
    label: "INTERACTION",
    counter: "02 / 05",
    start: 0.16,
    end: 0.34,
    state: "A quiet interaction",
    focus: "The cursor follows the Pricing thread",
    inspector: {
      heading: "One interaction opens the thread.",
      summary:
        "The Pricing link is selected as a starting point. Veyra follows the relationship without jumping to a conclusion.",
      conclusion: "The relationship is visible before a conclusion is made.",
    },
    milestones: [
      { at: 0, pathNodes: ["pricingBtn"], activeNodes: ["pricingBtn"] },
      { at: 0.5, pathNodes: ["pricingBtn", "pricingDom"], activeNodes: ["pricingDom"] },
    ],
    showEvidence: false,
    showHypotheses: false,
    showRecommendation: false,
    showBoundary: false,
    allowLayerExploration: false,
  },
  {
    key: "evidence",
    number: "03",
    label: "EVIDENCE & INITIAL CLAIM",
    counter: "03 / 05",
    start: 0.34,
    end: 0.62,
    state: "Evidence enters the frame",
    focus: "An observed response, with the initial claim held open",
    inspector: {
      heading: "The request ends at a missing route.",
      summary: "Observed path: the Pricing link sends GET /api/v2/pricing and receives HTTP 404.",
      conclusion: "Initial claim: the component may still point to an unmigrated route target.",
    },
    milestones: [
      { at: 0, pathNodes: ["pricingBtn", "pricingDom"], activeNodes: ["pricingDom"] },
      {
        at: 0.35,
        pathNodes: ["pricingBtn", "pricingDom", "brokenRoute"],
        activeNodes: ["brokenRoute"],
      },
      {
        at: 0.7,
        pathNodes: ["pricingBtn", "pricingDom", "brokenRoute", "pricingReq"],
        activeNodes: ["pricingReq"],
      },
      {
        at: 0.9,
        pathNodes: ["pricingBtn", "pricingDom", "brokenRoute", "pricingReq", "error404"],
        activeNodes: ["error404"],
      },
    ],
    showEvidence: true,
    showHypotheses: false,
    showRecommendation: false,
    showBoundary: false,
    allowLayerExploration: false,
  },
  {
    key: "challenge",
    number: "04",
    label: "CHALLENGE",
    counter: "04 / 05",
    start: 0.62,
    end: 0.84,
    state: "Candidate explanations are checked",
    focus: "The observed failure is challenged, not assumed",
    inspector: {
      heading: "Candidate explanations are challenged.",
      summary:
        "The click listener responds and the auth token is accepted. Neither explains the 404.",
      conclusion: "The candidates are challenged, not assumed away.",
    },
    milestones: [
      {
        at: 0,
        pathNodes: ["pricingBtn", "pricingDom", "brokenRoute", "pricingReq", "error404"],
        activeNodes: ["error404"],
      },
      {
        at: 0.42,
        pathNodes: ["pricingBtn", "pricingDom", "brokenRoute", "pricingReq", "error404", "authDep"],
        activeNodes: ["authDep"],
      },
      {
        at: 0.78,
        pathNodes: ["pricingBtn", "pricingDom", "brokenRoute", "pricingReq", "error404", "authDep"],
        activeNodes: [],
      },
    ],
    showEvidence: true,
    showHypotheses: true,
    showRecommendation: false,
    showBoundary: false,
    allowLayerExploration: true,
  },
  {
    key: "verdict",
    number: "05",
    label: "VERDICT & RECOMMENDATION",
    counter: "05 / 05",
    start: 0.84,
    end: 1,
    state: "Veyra follows the evidence",
    focus: "Observed 404 · scoped recommendation",
    inspector: {
      heading: "The Pricing link points to an old route.",
      summary: "It uses /pricing-v2; the active route is /pricing.",
      conclusion: "The route mismatch explains the observed 404.",
    },
    milestones: [
      {
        at: 0,
        pathNodes: ["pricingBtn", "pricingDom", "brokenRoute", "pricingReq", "error404", "authDep"],
        activeNodes: [],
      },
      {
        at: 0.2,
        pathNodes: [
          "pricingBtn",
          "pricingDom",
          "brokenRoute",
          "pricingReq",
          "error404",
          "authDep",
          "validRoute",
        ],
        activeNodes: ["validRoute"],
      },
    ],
    showEvidence: true,
    showHypotheses: true,
    showRecommendation: true,
    showBoundary: true,
    allowLayerExploration: true,
  },
];
const ASSEMBLED_OFFSET = [
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
];
const EXPLODED_OFFSET = [
  { x: -148, y: -108 },
  { x: -88, y: -12 },
  { x: -28, y: 84 },
  { x: 34, y: 169 },
  { x: 94, y: 250 },
];

export function mountVeyraScene(root) {
  const listeners = new AbortController();
  const { signal } = listeners;
  const viewport = root.querySelector("#viewport");
  viewport.tabIndex = 0;
  const stageScroll = root.querySelector("#showcase");
  const world = root.querySelector("#world");
  const traceLayer = root.querySelector("#trace-layer");
  const layers = [...root.querySelectorAll(".layer")];
  const stageState = root.querySelector("#stage-state");
  const inspectionRing = root.querySelector("#inspection-ring");
  const inspectionCallout = root.querySelector("#inspection-callout");
  const calloutTitle = root.querySelector("#callout-title");
  const calloutBody = root.querySelector("#callout-body");
  const sceneCursor = root.querySelector("#scene-cursor");
  const pricingCta = root.querySelector("#pricing-cta");
  const inspectorStep = root.querySelector("#inspector-step");
  const inspectorHeading = root.querySelector("#inspector-heading");
  const inspectorSummary = root.querySelector("#inspector-summary");
  const inspectorObservedLabel = root.querySelector("#inspector-observed-label");
  const inspectorConclusion = root.querySelector("#inspector-conclusion");
  const inspectorRecommendation = root.querySelector("#inspector-recommendation");
  const hypothesisClick = root.querySelector("#hypothesis-click");
  const hypothesisAuth = root.querySelector("#hypothesis-auth");
  const hypothesisClickState = root.querySelector("#hypothesis-click-state");
  const hypothesisAuthState = root.querySelector("#hypothesis-auth-state");
  const inspectorPanel = root.querySelector("#inspector");
  const inspectorLayerTitle = root.querySelector("#inspector-layer-title");
  const inspectorLayerCopy = root.querySelector("#inspector-layer-copy");
  const inspectorLayerReset = root.querySelector("#inspector-layer-reset");
  const hypothesisDetails = root.querySelector("#hypothesis-details");
  const mobileMenuToggle = root.querySelector(".mobile-menu-toggle");
  const mobileNav = root.querySelector("#mobile-nav");

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarsePointer = window.matchMedia("(pointer: coarse)");

  const anchors = {
    pricingBtn: { u: -210, v: -45, layer: 0 },
    productCard: { u: 140, v: -160, layer: 0 },
    pricingDom: { u: -210, v: -45, layer: 1 },
    productDom: { u: 140, v: -160, layer: 1 },
    brokenRoute: { u: -150, v: -45, layer: 2 },
    validRoute: { u: -150, v: 35, layer: 2 },
    catalogRes: { u: 140, v: -160, layer: 2 },
    pricingReq: { u: -90, v: -45, layer: 3 },
    authDep: { u: -90, v: -115, layer: 3 },
    catalogReq: { u: 140, v: -160, layer: 3 },
    error404: { u: -30, v: -45, layer: 4 },
    ok200: { u: 140, v: -160, layer: 4 },
  };

  const traceDefinitions = [
    { id: "pricing-ui-dom", from: "pricingBtn", to: "pricingDom", type: "primary" },
    { id: "pricing-dom-route", from: "pricingDom", to: "brokenRoute", type: "primary" },
    { id: "pricing-route-request", from: "brokenRoute", to: "pricingReq", type: "fault" },
    { id: "pricing-request-response", from: "pricingReq", to: "error404", type: "fault" },
    { id: "pricing-auth-check", from: "pricingDom", to: "authDep", type: "challenge" },
    { id: "pricing-valid-route", from: "pricingDom", to: "validRoute", type: "fix" },
    { id: "pricing-ui-route-bridge", from: "pricingBtn", to: "brokenRoute", type: "ambient" },
    { id: "pricing-dom-request-bridge", from: "pricingDom", to: "pricingReq", type: "ambient" },
    { id: "route-auth-bridge", from: "brokenRoute", to: "authDep", type: "challenge" },
    { id: "route-valid-request-bridge", from: "validRoute", to: "pricingReq", type: "fix" },
    { id: "catalog-ui-dom", from: "productCard", to: "productDom", type: "healthy" },
    { id: "catalog-dom-resource", from: "productDom", to: "catalogRes", type: "healthy" },
    { id: "catalog-resource-request", from: "catalogRes", to: "catalogReq", type: "healthy" },
    { id: "catalog-request-response", from: "catalogReq", to: "ok200", type: "healthy" },
    { id: "catalog-dom-request-bridge", from: "productDom", to: "catalogReq", type: "ambient" },
    { id: "catalog-resource-response-bridge", from: "catalogRes", to: "ok200", type: "ambient" },
  ];

  const state = {
    current: 0,
    progress: 0,
    manualYaw: 0,
    manualPitch: 0,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragYaw: 0,
    dragPitch: 0,
    dragMoved: false,
    hoveredLayer: null,
  };

  const anchorSockets = {};
  const focusElements = {
    pricingBtn: root.querySelector("#pricing-cta"),
    pricingDom: root.querySelector(".pricing-box"),
    brokenRoute: root.querySelector(".route-broken"),
    pricingReq: root.querySelector(".request-broken"),
    error404: root.querySelector(".response-bad"),
    authDep: root.querySelector(".dependency-auth"),
    validRoute: root.querySelector(".route-valid"),
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(from, to, amount) {
    return from + (to - from) * amount;
  }

  function narrativeFrameFor(progress) {
    const value = clamp(progress, 0, 1);
    const stageIndex = Math.min(
      NARRATIVE_STAGES.length - 1,
      NARRATIVE_STAGES.findIndex((stage) => value < stage.end),
    );
    const stage = NARRATIVE_STAGES[stageIndex < 0 ? NARRATIVE_STAGES.length - 1 : stageIndex];
    const localProgress =
      stage.end === stage.start
        ? 1
        : clamp((value - stage.start) / (stage.end - stage.start), 0, 1);
    let milestone = stage.milestones[0];
    stage.milestones.forEach((candidate) => {
      if (candidate.at <= localProgress) milestone = candidate;
    });
    return {
      stage,
      stageIndex,
      progress: value,
      localProgress,
      pathNodes: milestone.pathNodes,
      activeNodes: milestone.activeNodes,
    };
  }

  function layerExplorationAllowed(progress) {
    return narrativeFrameFor(progress).stage.allowLayerExploration;
  }

  function updateLayerAccessibility(progress) {
    const interactive = layerExplorationAllowed(progress);
    layers.forEach((layer, index) => {
      const title = layer.dataset.layerTitle ?? `layer ${index + 1}`;
      const copy = layer.dataset.layerCopy ?? "";
      if (interactive) {
        layer.tabIndex = 0;
      } else {
        layer.removeAttribute("tabindex");
      }
      layer.setAttribute("aria-disabled", String(!interactive));
      layer.setAttribute(
        "aria-label",
        interactive
          ? `Layer ${index + 1}: ${title}. ${copy} Use Enter or Space to select; press Escape to clear selection.`
          : `Layer ${index + 1}: ${title}. It becomes interactive during the Challenge stage.`,
      );
      if (!interactive && document.activeElement === layer) layer.blur();
    });
  }

  function easeInOutCubic(value) {
    const t = clamp(value, 0, 1);
    if (prefersReducedMotion.matches) return t;
    return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  }

  function easeOutBack(value) {
    const t = clamp(value, 0, 1);
    if (prefersReducedMotion.matches) return t;
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  }

  function easeOutCubic(value) {
    const t = clamp(value, 0, 1);
    return prefersReducedMotion.matches ? t : 1 - (1 - t) ** 3;
  }

  function syncAnchorSockets() {
    root.querySelectorAll("[data-node]").forEach((anchorElement) => {
      const socket = anchorElement.querySelector("span");
      const anchor = anchors[anchorElement.dataset.node];
      if (!socket || !anchor) return;
      const x = anchorElement.offsetLeft + socket.offsetLeft + socket.offsetWidth / 2 - 480;
      const y = anchorElement.offsetTop + socket.offsetTop + socket.offsetHeight / 2 - 300;
      anchorSockets[anchorElement.dataset.node] = { u: x, v: -y, layer: anchor.layer };
    });
  }

  function pointFor(nodeKey, layerZ, layerOffset) {
    const node = anchorSockets[nodeKey] ?? anchors[nodeKey];
    return {
      x: node.u + layerOffset[node.layer].x,
      y: -node.v + layerOffset[node.layer].y,
      z: layerZ[node.layer],
    };
  }

  function tracePoints(definition, layerZ, layerOffset) {
    const start = pointFor(definition.from, layerZ, layerOffset);
    const end = pointFor(definition.to, layerZ, layerOffset);
    const zOne = lerp(start.z, end.z, 0.35);
    const zTwo = lerp(start.z, end.z, 0.65);
    return [
      start,
      { x: lerp(start.x, end.x, 0.2), y: lerp(start.y, end.y, 0.2), z: zOne },
      { x: lerp(start.x, end.x, 0.8), y: lerp(start.y, end.y, 0.8), z: zTwo },
      end,
    ];
  }

  function createTrace(definition) {
    const path = document.createElement("div");
    path.className = `trace-path trace-${definition.type}`;
    path.dataset.traceId = definition.id;
    path.dataset.traceType = definition.type;
    const segments = [];
    for (let index = 0; index < 3; index += 1) {
      const segment = document.createElement("span");
      segment.className = "trace-segment";
      path.appendChild(segment);
      segments.push(segment);
    }
    traceLayer.appendChild(path);
    return { definition, path, segments };
  }

  const traces = traceDefinitions.map(createTrace);

  function placeSegment(element, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dz = end.z - start.z;
    const horizontal = Math.hypot(dx, dz);
    const length = Math.hypot(dx, dy, dz);
    const yaw = Math.atan2(-dz, dx) * (180 / Math.PI);
    const pitch = Math.atan2(dy, horizontal || 0.0001) * (180 / Math.PI);
    const distance = Math.max(18, length * 0.58);
    element.style.width = `${length}px`;
    element.style.setProperty("--signal-distance", `${distance}px`);
    element.style.transform = `translate3d(${start.x}px, ${start.y}px, ${start.z}px) rotateY(${yaw}deg) rotateZ(${pitch}deg)`;
  }

  function sceneTuning() {
    if (viewport.clientWidth <= 600) return { depth: 0.72, offsetX: 0.62, offsetY: 0.56 };
    if (viewport.clientWidth <= 900) return { depth: 0.86, offsetX: 0.84, offsetY: 0.8 };
    return { depth: 1, offsetX: 1, offsetY: 1 };
  }

  function updateTraceGeometry(layerZ, layerOffset) {
    traces.forEach((trace) => {
      const points = tracePoints(trace.definition, layerZ, layerOffset);
      trace.segments.forEach((segment, index) => {
        placeSegment(segment, points[index], points[index + 1]);
      });
    });
  }

  function calculateLayerZ(progress) {
    if (progress < 0.44) return [...ASSEMBLED_Z];
    const tuning = sceneTuning();
    const separation = easeInOutCubic((progress - 0.44) / 0.42);
    return EXPLODED_Z.map((value, index) =>
      lerp(ASSEMBLED_Z[index], value * tuning.depth, separation),
    );
  }

  function calculateLayerOffset(progress) {
    if (progress < 0.44) return ASSEMBLED_OFFSET;
    const tuning = sceneTuning();
    const separation = easeOutBack((progress - 0.44) / 0.42);
    return EXPLODED_OFFSET.map((value, index) => ({
      x: lerp(ASSEMBLED_OFFSET[index].x, value.x * tuning.offsetX, separation),
      y: lerp(ASSEMBLED_OFFSET[index].y, value.y * tuning.offsetY, separation),
    }));
  }

  function compactCameraFor(progress) {
    if (progress < 0.3) {
      return { yaw: 0, pitch: 0, zoom: 1.02, shiftX: 0, shiftY: -8 };
    }
    if (progress < 0.5) {
      const amount = easeInOutCubic((progress - 0.3) / 0.2);
      return {
        yaw: lerp(0, -6, amount),
        pitch: lerp(0, 10, amount),
        zoom: lerp(1.02, 0.92, amount),
        shiftX: lerp(0, -8, amount),
        shiftY: lerp(-8, -22, amount),
      };
    }
    if (progress < 0.66) {
      const amount = easeInOutCubic((progress - 0.5) / 0.16);
      return {
        yaw: lerp(-6, -14, amount),
        pitch: lerp(10, 30, amount),
        zoom: lerp(0.92, 0.82, amount),
        shiftX: lerp(-8, -20, amount),
        shiftY: lerp(-22, -44, amount),
      };
    }
    if (progress < 0.88) {
      const amount = easeInOutCubic((progress - 0.66) / 0.22);
      return {
        yaw: lerp(-14, -11, amount),
        pitch: lerp(30, 28, amount),
        zoom: lerp(0.82, 0.86, amount),
        shiftX: lerp(-20, -10, amount),
        shiftY: lerp(-44, -48, amount),
      };
    }
    const amount = easeInOutCubic((progress - 0.88) / 0.12);
    return {
      yaw: lerp(-11, -8, amount),
      pitch: lerp(28, 24, amount),
      zoom: lerp(0.86, 0.9, amount),
      shiftX: lerp(-10, 0, amount),
      shiftY: lerp(-48, -54, amount),
    };
  }

  function reducedMotionCameraFor() {
    if (viewport.clientWidth <= 600)
      return { yaw: -8, pitch: 18, zoom: 0.9, shiftX: -8, shiftY: -24 };
    if (viewport.clientWidth <= 900)
      return { yaw: -11, pitch: 24, zoom: 0.86, shiftX: -16, shiftY: -18 };
    return { yaw: -14, pitch: 30, zoom: 0.82, shiftX: -28, shiftY: -18 };
  }

  function cameraFor(progress) {
    if (prefersReducedMotion.matches) return reducedMotionCameraFor();
    if (viewport.clientWidth <= 600) return compactCameraFor(progress);
    if (progress < 0.3) {
      return { yaw: 0, pitch: 0, zoom: 1, shiftX: 0, shiftY: 0 };
    }
    if (progress < 0.5) {
      const amount = easeInOutCubic((progress - 0.3) / 0.2);
      return {
        yaw: lerp(0, -9, amount),
        pitch: lerp(0, 13, amount),
        zoom: lerp(1, 0.9, amount),
        shiftX: lerp(0, -12, amount),
        shiftY: lerp(0, -8, amount),
      };
    }
    if (progress < 0.66) {
      const amount = easeInOutCubic((progress - 0.5) / 0.16);
      return {
        yaw: lerp(-9, -22, amount),
        pitch: lerp(13, 44, amount),
        zoom: lerp(0.9, 0.75, amount),
        shiftX: lerp(-12, -62, amount),
        shiftY: lerp(-8, -46, amount),
      };
    }
    if (progress < 0.88) {
      const amount = easeInOutCubic((progress - 0.66) / 0.22);
      return {
        yaw: lerp(-22, -19, amount),
        pitch: lerp(44, 42, amount),
        zoom: lerp(0.75, 0.78, amount),
        shiftX: lerp(-62, -54, amount),
        shiftY: lerp(-46, -38, amount),
      };
    }
    const amount = easeInOutCubic((progress - 0.88) / 0.12);
    return {
      yaw: lerp(-19, -16, amount),
      pitch: lerp(42, 39, amount),
      zoom: lerp(0.78, 0.8, amount),
      shiftX: lerp(-54, -42, amount),
      shiftY: lerp(-38, -27, amount),
    };
  }

  function updateLayerClasses(progress) {
    const frame = narrativeFrameFor(progress);
    const expanded = progress >= 0.44;
    const investigating = frame.stage.key === "challenge" || frame.stage.key === "verdict";
    const canExplore = layerExplorationAllowed(progress);
    layers.forEach((layer, index) => {
      layer.classList.toggle("is-expanded", expanded);
      layer.classList.toggle("is-isolated", investigating);
      layer.classList.toggle("is-focused", investigating && index <= 4);
      layer.classList.toggle("is-hovered", state.hoveredLayer === index && canExplore);
      layer.classList.toggle(
        "is-dimmed",
        state.hoveredLayer !== null && state.hoveredLayer !== index && canExplore,
      );
    });
  }

  function visibilityForLayer(index, progress) {
    if (index === 0) return 1;
    if (progress < 0.42) return 0;
    if (progress < 0.6) return LAYER_BASE_OPACITY[index] * easeOutCubic((progress - 0.42) / 0.18);
    return LAYER_BASE_OPACITY[index];
  }

  function traceOpacity(type, frame) {
    const { progress, stage, localProgress } = frame;
    if (type === "healthy")
      return progress < 0.58 ? 0 : 0.2 + 0.36 * easeOutCubic((progress - 0.58) / 0.18);
    if (type === "primary") {
      if (progress < 0.2) return 0;
      if (progress < 0.5) return 0.45;
      if (progress < 0.7) return 0.85;
      if (progress < 0.74) return lerp(0.85, 1, easeInOutCubic((progress - 0.7) / 0.04));
      return 1;
    }
    if (type === "fault")
      return progress < 0.5 ? 0 : progress < 0.7 ? easeOutCubic((progress - 0.5) / 0.2) : 1;
    if (type === "challenge") {
      if (stage.key === "challenge") {
        if (localProgress < 0.74) return 0.9;
        if (localProgress < 0.82)
          return lerp(0.9, 0.28, easeInOutCubic((localProgress - 0.74) / 0.08));
        return 0.28;
      }
      return stage.key === "verdict" ? 0.28 : 0;
    }
    if (type === "fix") return stage.key === "verdict" && localProgress >= 0.2 ? 0.78 : 0;
    if (type === "ambient")
      return progress < 0.54 ? 0 : 0.16 + 0.28 * easeOutCubic((progress - 0.54) / 0.24);
    return 0;
  }

  function updateTraces(progress, layerZ, layerOffset) {
    const frame = narrativeFrameFor(progress);
    traces.forEach((trace) => {
      const opacity = traceOpacity(trace.definition.type, frame);
      // Opacity/filter on this preserve-3d parent flatten and displace its segments.
      // Inherit visibility to each segment instead, keeping the 3D context intact.
      trace.path.style.setProperty("--trace-opacity", String(opacity));
      trace.path.classList.toggle("is-hidden", opacity < 0.01);
      trace.path.classList.toggle("is-background", trace.definition.type === "healthy");
      trace.path.classList.toggle(
        "is-challenged",
        trace.definition.type === "challenge" &&
          (frame.stage.key === "verdict" ||
            (frame.stage.key === "challenge" && frame.localProgress >= 0.82)),
      );
      trace.path.classList.toggle(
        "is-fault",
        trace.definition.type === "fault" ||
          (trace.definition.type === "primary" && progress >= 0.58),
      );
      trace.path.classList.toggle(
        "is-hovered",
        state.hoveredLayer !== null &&
          (anchors[trace.definition.from].layer === state.hoveredLayer ||
            anchors[trace.definition.to].layer === state.hoveredLayer),
      );
      const signalActive =
        (trace.definition.type === "healthy" && progress >= 0.68) ||
        (trace.definition.type === "fault" && progress >= 0.58) ||
        (trace.definition.type === "primary" && progress >= 0.24) ||
        (trace.definition.type === "challenge" &&
          frame.stage.key === "challenge" &&
          frame.localProgress < 0.82) ||
        (trace.definition.type === "fix" &&
          frame.stage.key === "verdict" &&
          frame.localProgress >= 0.2) ||
        (trace.definition.type === "ambient" && progress >= 0.7);
      trace.segments.forEach((segment) => {
        segment.classList.toggle("is-active", signalActive);
      });
    });
    updateTraceGeometry(layerZ, layerOffset);
  }

  function updatePathHighlights(progress) {
    const frame = narrativeFrameFor(progress);
    const activeNodes = new Set(frame.activeNodes);
    const pathNodes = new Set(frame.pathNodes);

    root.querySelectorAll("[data-node]").forEach((anchorElement) => {
      anchorElement.classList.toggle("is-active", activeNodes.has(anchorElement.dataset.node));
      anchorElement.classList.toggle("is-path-node", pathNodes.has(anchorElement.dataset.node));
    });
    Object.entries(focusElements).forEach(([nodeKey, element]) => {
      element?.classList.toggle("is-active-node", activeNodes.has(nodeKey));
      element?.classList.toggle("is-path-node", pathNodes.has(nodeKey));
    });
  }

  function updateLayerExploration(progress) {
    const canExplore = layerExplorationAllowed(progress);
    inspectorPanel.classList.add("is-stage-visible");
    stageScroll.classList.add("is-inspection-visible");
    inspectorPanel.classList.toggle("is-layer-context-visible", canExplore);
    if (!canExplore && state.hoveredLayer !== null) {
      state.hoveredLayer = null;
    }
    inspectorLayerReset.hidden = !canExplore || state.hoveredLayer === null;
    if (state.hoveredLayer !== null && canExplore) {
      const layer = layers[state.hoveredLayer];
      inspectorLayerTitle.textContent = `Layer ${layer.dataset.layer}: ${layer.dataset.layerTitle}`;
      inspectorLayerCopy.textContent = layer.dataset.layerCopy;
      inspectorLayerCopy.hidden = false;
    } else {
      inspectorLayerTitle.textContent = "Select a layer to see its role.";
      inspectorLayerCopy.textContent = "";
      inspectorLayerCopy.hidden = true;
    }
    updateLayerAccessibility(progress);
  }

  function stageFor(progress) {
    const { stage } = narrativeFrameFor(progress);
    return { state: stage.state, focus: stage.focus, stage: stage.counter };
  }

  function updateInspector(progress) {
    const frame = narrativeFrameFor(progress);
    const { stage, localProgress } = frame;
    inspectorPanel.dataset.narrativeStage = stage.key;
    inspectorPanel.classList.toggle("is-evidence-visible", stage.showEvidence);
    inspectorPanel.classList.toggle("is-hypotheses-visible", stage.showHypotheses);
    inspectorPanel.classList.toggle("is-recommendation-visible", stage.showRecommendation);
    inspectorPanel.classList.toggle("is-boundary-visible", stage.showBoundary);
    inspectorStep.textContent = `Stage ${stage.number} · ${stage.label}`;
    inspectorHeading.textContent = stage.inspector.heading;
    inspectorSummary.textContent = stage.inspector.summary;
    inspectorConclusion.textContent = stage.inspector.conclusion;
    inspectorObservedLabel.textContent = "Observed path";
    if (!stage.showHypotheses) hypothesisDetails.open = false;

    const clickState =
      stage.key === "challenge" && localProgress < 0.42
        ? "CHECKING"
        : stage.key === "challenge" || stage.key === "verdict"
          ? "RULED OUT"
          : "PENDING";
    const authState =
      stage.key === "challenge" && localProgress >= 0.42 && localProgress < 0.78
        ? "CHECKING"
        : stage.key === "verdict" || (stage.key === "challenge" && localProgress >= 0.78)
          ? "RULED OUT"
          : "PENDING";
    hypothesisClickState.textContent = clickState;
    hypothesisAuthState.textContent = authState;
    hypothesisClick.classList.toggle("is-active", clickState === "CHECKING");
    hypothesisAuth.classList.toggle("is-active", authState === "CHECKING");
    hypothesisClick.classList.toggle("is-ruled-out", clickState === "RULED OUT");
    hypothesisAuth.classList.toggle("is-ruled-out", authState === "RULED OUT");
    inspectorRecommendation.innerHTML =
      stage.key === "verdict"
        ? "Suggested fix: update the target to <code>/pricing</code>, then verify the response."
        : "The suggested fix appears after the route is checked.";
  }

  function updateInspection(progress, layerZ, layerOffset) {
    const frame = narrativeFrameFor(progress);
    const active = frame.pathNodes.includes("error404");
    const entrance = easeOutCubic(
      frame.stage.key === "evidence" ? (frame.localProgress - 0.9) / 0.1 : 1,
    );
    const visibility = active ? clamp(entrance, 0, 1) : 0;
    const target = pointFor("error404", layerZ, layerOffset);
    inspectionRing.style.opacity = `${visibility}`;
    inspectionRing.style.transform = `translate3d(${target.x}px, ${target.y}px, ${target.z - 8}px) scale(${lerp(0.72, 1, visibility)})`;
    inspectionCallout.style.opacity = "0";

    if (frame.stage.key !== "verdict") {
      calloutTitle.textContent = "Evidence path located";
      calloutBody.textContent =
        "Pricing CTA dispatched, but the request terminates at a missing route.";
    } else {
      calloutTitle.textContent = "Route mismatch isolated";
      calloutBody.textContent =
        "The component still points at /pricing-v2; the active target is /pricing.";
    }
  }

  function updateCursor(progress) {
    const frame = narrativeFrameFor(progress);
    const visible = frame.stage.key === "interaction" && frame.localProgress < 0.78;
    const approach = easeOutCubic((frame.localProgress - 0.08) / 0.28);
    const retreat =
      frame.localProgress >= 0.58 ? 1 - easeInOutCubic((frame.localProgress - 0.58) / 0.2) : 1;
    const visibility = visible ? clamp(Math.min(approach, retreat), 0, 1) : 0;
    const x = lerp(-220, -390, easeOutCubic((frame.localProgress - 0.08) / 0.48));
    const y = lerp(82, 96, easeOutCubic((frame.localProgress - 0.08) / 0.48));
    sceneCursor.style.opacity = `${visibility}`;
    sceneCursor.style.transform = `translate3d(${x}px, ${y}px, 18px)`;
    pricingCta.classList.toggle(
      "is-cursor-target",
      frame.stage.key === "interaction" &&
        frame.localProgress >= 0.24 &&
        frame.localProgress < 0.62,
    );
  }

  function render(time = state.current) {
    state.current = clamp(time, 0, DURATION);
    state.progress = state.current / DURATION;
    const layerZ = calculateLayerZ(state.progress);
    const layerOffset = calculateLayerOffset(state.progress);
    const camera = cameraFor(state.progress);
    const yaw = camera.yaw + state.manualYaw;
    const pitch = camera.pitch + state.manualPitch;
    const zoom = camera.zoom;

    world.style.setProperty("--scene-yaw", `${yaw}deg`);
    world.style.setProperty("--scene-pitch", `${pitch}deg`);
    world.style.setProperty("--scene-zoom", String(zoom));
    world.style.setProperty("--scene-shift-x", `${camera.shiftX}px`);
    world.style.setProperty("--scene-shift-y", `${camera.shiftY}px`);

    layers.forEach((layer, index) => {
      layer.style.setProperty(
        "--layer-visibility",
        String(visibilityForLayer(index, state.progress)),
      );
      layer.style.transform = `translate3d(${layerOffset[index].x}px, ${layerOffset[index].y}px, ${layerZ[index]}px)`;
    });

    updateLayerClasses(state.progress);
    updateTraces(state.progress, layerZ, layerOffset);
    updatePathHighlights(state.progress);
    updateLayerExploration(state.progress);
    updateInspection(state.progress, layerZ, layerOffset);
    updateCursor(state.progress);
    updateInspector(state.progress);

    const stage = stageFor(state.progress);
    stageState.textContent = stage.state;
  }

  function scrollProgress() {
    const rect = stageScroll.getBoundingClientRect();
    const travel = Math.max(1, stageScroll.offsetHeight - window.innerHeight);
    return clamp(-rect.top / travel, 0, 1);
  }

  let scrollFrame = 0;
  function syncToScroll() {
    scrollFrame = 0;
    render(scrollProgress() * DURATION);
  }

  function requestScrollSync() {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(syncToScroll);
  }

  function updateWorldScale() {
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    if (width <= 600) {
      const phoneScale = (width - 32) / 960;
      root.style.setProperty("--world-scale", clamp(phoneScale, 0.34, 0.42).toFixed(3));
      syncAnchorSockets();
      requestScrollSync();
      return;
    }
    if (width <= 900) {
      const compactScale = Math.min((width - 48) / 1100, (height - 220) / 900);
      root.style.setProperty("--world-scale", clamp(compactScale, 0.46, 0.68).toFixed(3));
      syncAnchorSockets();
      requestScrollSync();
      return;
    }
    const fitWidth = (width - 70) / 1210;
    const fitHeight = (height - 54) / 940;
    const scale = clamp(Math.min(fitWidth, fitHeight), 0.3, 0.82);
    root.style.setProperty("--world-scale", scale.toFixed(3));
    syncAnchorSockets();
    requestScrollSync();
  }

  let resizeFrame = 0;
  const resizeObserver = new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(updateWorldScale);
  });
  resizeObserver.observe(viewport);

  viewport.addEventListener(
    "pointerdown",
    (event) => {
      if (event.target.closest("button, input, a")) return;
      state.dragging = true;
      state.dragMoved = false;
      state.dragStartX = event.clientX;
      state.dragStartY = event.clientY;
      state.dragYaw = state.manualYaw;
      state.dragPitch = state.manualPitch;
      viewport.classList.add("is-dragging");
      if (event.pointerType !== "touch") viewport.setPointerCapture(event.pointerId);
    },
    { signal },
  );

  viewport.addEventListener(
    "pointermove",
    (event) => {
      if (!state.dragging) return;
      const dx = event.clientX - state.dragStartX;
      const dy = event.clientY - state.dragStartY;
      if (Math.hypot(dx, dy) > 6) state.dragMoved = true;
      if (event.pointerType === "touch" && Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) * 1.2) {
        state.dragging = false;
        viewport.classList.remove("is-dragging");
        return;
      }
      state.manualYaw = clamp(state.dragYaw + dx * 0.24, -38, 38);
      state.manualPitch = clamp(state.dragPitch - dy * 0.2, -20, 20);
      render();
    },
    { signal },
  );

  function layerAtPoint(clientX, clientY) {
    if (!layerExplorationAllowed(state.progress)) return null;
    const candidates = layers
      .map((layer, index) => {
        const rect = layer.getBoundingClientRect();
        if (
          clientX < rect.left ||
          clientX > rect.right ||
          clientY < rect.top ||
          clientY > rect.bottom
        )
          return null;
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        return { index, distance: Math.hypot(clientX - centerX, clientY - centerY) };
      })
      .filter(Boolean)
      .sort((a, b) => a.distance - b.distance);
    return candidates[0]?.index ?? null;
  }

  viewport.addEventListener(
    "pointermove",
    (event) => {
      if (state.dragging || !layerExplorationAllowed(state.progress)) return;
      const layerIndex = layerAtPoint(event.clientX, event.clientY);
      if (layerIndex === state.hoveredLayer) return;
      if (layerIndex === null) {
        clearHoveredLayer();
      } else {
        setHoveredLayer(layerIndex);
      }
    },
    { signal },
  );

  viewport.addEventListener(
    "pointerleave",
    () => {
      if (!state.dragging && !coarsePointer.matches) clearHoveredLayer();
    },
    { signal },
  );

  function endDrag(event) {
    if (!state.dragging) return;
    const isTap = !state.dragMoved;
    const touchLike = event?.pointerType === "touch" || coarsePointer.matches;
    state.dragging = false;
    viewport.classList.remove("is-dragging");
    if (event?.pointerId !== undefined && viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
    if (isTap && touchLike && layerExplorationAllowed(state.progress)) {
      const layerIndex = layerAtPoint(event.clientX, event.clientY);
      if (layerIndex !== null) toggleLayer(layerIndex);
    }
  }

  viewport.addEventListener("pointerup", endDrag, { signal });
  viewport.addEventListener("pointercancel", endDrag, { signal });

  viewport.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        clearHoveredLayer();
        return;
      }
      const step = event.shiftKey ? 8 : 4;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        state.manualYaw = clamp(
          state.manualYaw + (event.key === "ArrowLeft" ? -step : step),
          -38,
          38,
        );
        render();
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        state.manualPitch = clamp(
          state.manualPitch + (event.key === "ArrowUp" ? step : -step),
          -20,
          20,
        );
        render();
      } else if (event.key === "Home") {
        event.preventDefault();
        state.manualYaw = 0;
        state.manualPitch = 0;
        render();
      }
    },
    { signal },
  );

  function setHoveredLayer(layerIndex) {
    if (!layerExplorationAllowed(state.progress)) return;
    state.hoveredLayer = layerIndex;
    viewport.dataset.selectedLayer = String(layerIndex);
    updateLayerExploration(state.progress);
    render();
  }

  function toggleLayer(layerIndex) {
    const selectedLayer =
      state.hoveredLayer ??
      (viewport.dataset.selectedLayer
        ? Number(viewport.dataset.selectedLayer)
        : Number(root.querySelector(".layer.is-hovered")?.dataset.layer) - 1);
    if (selectedLayer === layerIndex) {
      clearHoveredLayer();
      return;
    }
    setHoveredLayer(layerIndex);
  }

  function clearHoveredLayer() {
    state.hoveredLayer = null;
    delete viewport.dataset.selectedLayer;
    updateLayerExploration(state.progress);
    render();
  }

  inspectorLayerReset?.addEventListener("click", clearHoveredLayer, { signal });

  layers.forEach((layer, index) => {
    layer.addEventListener(
      "pointerenter",
      () => {
        if (!coarsePointer.matches) setHoveredLayer(index);
      },
      { signal },
    );
    layer.addEventListener(
      "pointerleave",
      () => {
        if (!coarsePointer.matches) clearHoveredLayer();
      },
      { signal },
    );
    layer.addEventListener(
      "focus",
      () => {
        if (!coarsePointer.matches) setHoveredLayer(index);
      },
      { signal },
    );
    layer.addEventListener(
      "blur",
      () => {
        if (!coarsePointer.matches) clearHoveredLayer();
      },
      { signal },
    );
    layer.addEventListener(
      "keydown",
      (event) => {
        if (!layerExplorationAllowed(state.progress)) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setHoveredLayer(index);
        } else if (event.key === "Escape") {
          event.preventDefault();
          clearHoveredLayer();
          layer.blur();
        }
      },
      { signal },
    );
  });

  function closeMobileNav() {
    if (!mobileMenuToggle || !mobileNav) return;
    mobileMenuToggle.setAttribute("aria-expanded", "false");
    mobileNav.hidden = true;
  }

  mobileMenuToggle?.addEventListener(
    "click",
    (event) => {
      event.stopPropagation();
      const expanded = mobileMenuToggle.getAttribute("aria-expanded") === "true";
      mobileMenuToggle.setAttribute("aria-expanded", String(!expanded));
      mobileNav.hidden = expanded;
    },
    { signal },
  );

  mobileNav?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMobileNav, { signal });
  });

  document.addEventListener(
    "click",
    (event) => {
      if (!mobileNav || mobileNav.hidden) return;
      if (!event.target.closest(".app-header")) closeMobileNav();
    },
    { signal },
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") closeMobileNav();
    },
    { signal },
  );

  window.addEventListener("scroll", requestScrollSync, { passive: true, signal });
  window.addEventListener("resize", requestScrollSync, { signal });
  prefersReducedMotion.addEventListener?.("change", requestScrollSync, { signal });

  syncAnchorSockets();
  updateWorldScale();
  syncToScroll();
  root.dataset.sceneReady = "true";

  return () => {
    listeners.abort();
    resizeObserver.disconnect();
    cancelAnimationFrame(resizeFrame);
    cancelAnimationFrame(scrollFrame);
    traceLayer.replaceChildren();
    viewport.removeAttribute("tabindex");
    delete root.dataset.sceneReady;
  };
}
