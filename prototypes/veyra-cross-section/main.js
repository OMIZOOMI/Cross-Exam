const DURATION = 10.8;
const LAYER_BASE_OPACITY = [1, 0.92, 0.9, 0.9, 0.94];
const ASSEMBLED_Z = [0, -10, -20, -30, -40];
const EXPLODED_Z = [0, -96, -192, -288, -384];
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

const viewport = document.querySelector("#viewport");
const stageScroll = document.querySelector("#showcase");
const world = document.querySelector("#world");
const traceLayer = document.querySelector("#trace-layer");
const layers = [...document.querySelectorAll(".layer")];
const stageState = document.querySelector("#stage-state");
const focusLabel = document.querySelector("#focus-label");
const inspectionRing = document.querySelector("#inspection-ring");
const inspectionCallout = document.querySelector("#inspection-callout");
const calloutTitle = document.querySelector("#callout-title");
const calloutBody = document.querySelector("#callout-body");
const sceneCursor = document.querySelector("#scene-cursor");
const pricingCta = document.querySelector("#pricing-cta");
const inspectorStep = document.querySelector("#inspector-step");
const inspectorHeading = document.querySelector("#inspector-heading");
const inspectorSummary = document.querySelector("#inspector-summary");
const inspectorConclusion = document.querySelector("#inspector-conclusion");
const inspectorRecommendation = document.querySelector("#inspector-recommendation");
const hypothesisClick = document.querySelector("#hypothesis-click");
const hypothesisAuth = document.querySelector("#hypothesis-auth");
const hypothesisClickState = document.querySelector("#hypothesis-click-state");
const hypothesisAuthState = document.querySelector("#hypothesis-auth-state");
const scrollProgressBar = document.querySelector("#scroll-progress-bar");
const scrollStageLabel = document.querySelector("#scroll-stage-label");
const inspectorPanel = document.querySelector("#inspector");
const layerHoverNote = document.querySelector("#layer-hover-note");
const layerHoverTitle = document.querySelector("#layer-hover-title");
const layerHoverCopy = document.querySelector("#layer-hover-copy");

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

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
  hoveredLayer: null,
};

const anchorSockets = {};
const focusElements = {
  pricingBtn: document.querySelector("#pricing-cta"),
  pricingDom: document.querySelector(".pricing-box"),
  brokenRoute: document.querySelector(".route-broken"),
  pricingReq: document.querySelector(".request-broken"),
  error404: document.querySelector(".response-bad"),
  authDep: document.querySelector(".dependency-auth"),
  validRoute: document.querySelector(".route-valid"),
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

function easeInOutCubic(value) {
  const t = clamp(value, 0, 1);
  if (prefersReducedMotion.matches) return t;
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutBack(value) {
  const t = clamp(value, 0, 1);
  if (prefersReducedMotion.matches) return t;
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeOutCubic(value) {
  const t = clamp(value, 0, 1);
  return prefersReducedMotion.matches ? t : 1 - Math.pow(1 - t, 3);
}

function syncAnchorSockets() {
  document.querySelectorAll("[data-node]").forEach((anchorElement) => {
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
  return { x: node.u + layerOffset[node.layer].x, y: -node.v + layerOffset[node.layer].y, z: layerZ[node.layer] };
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

function updateTraceGeometry(layerZ, layerOffset) {
  traces.forEach((trace) => {
    const points = tracePoints(trace.definition, layerZ, layerOffset);
    trace.segments.forEach((segment, index) => placeSegment(segment, points[index], points[index + 1]));
  });
}

function calculateLayerZ(progress) {
  if (progress < 0.44) return [...ASSEMBLED_Z];
  const separation = easeInOutCubic((progress - 0.44) / 0.42);
  return EXPLODED_Z.map((value, index) => lerp(ASSEMBLED_Z[index], value, separation));
}

function calculateLayerOffset(progress) {
  if (progress < 0.44) return ASSEMBLED_OFFSET;
  const separation = easeOutBack((progress - 0.44) / 0.42);
  return EXPLODED_OFFSET.map((value, index) => ({
    x: lerp(ASSEMBLED_OFFSET[index].x, value.x, separation),
    y: lerp(ASSEMBLED_OFFSET[index].y, value.y, separation),
  }));
}

function cameraFor(progress) {
  if (progress < 0.3) {
    return { yaw: 0, pitch: 0, zoom: 1, shiftX: 0, shiftY: 0 };
  }
  if (progress < 0.5) {
    const amount = easeInOutCubic((progress - 0.3) / 0.2);
    return { yaw: lerp(0, -9, amount), pitch: lerp(0, 13, amount), zoom: lerp(1, 0.9, amount), shiftX: lerp(0, -12, amount), shiftY: lerp(0, -8, amount) };
  }
  if (progress < 0.66) {
    const amount = easeInOutCubic((progress - 0.5) / 0.16);
    return { yaw: lerp(-9, -22, amount), pitch: lerp(13, 44, amount), zoom: lerp(0.9, 0.75, amount), shiftX: lerp(-12, -62, amount), shiftY: lerp(-8, -46, amount) };
  }
  if (progress < 0.88) {
    const amount = easeInOutCubic((progress - 0.66) / 0.22);
    return { yaw: lerp(-22, -19, amount), pitch: lerp(44, 42, amount), zoom: lerp(0.75, 0.78, amount), shiftX: lerp(-62, -54, amount), shiftY: lerp(-46, -38, amount) };
  }
  const amount = easeInOutCubic((progress - 0.88) / 0.12);
  return { yaw: lerp(-19, -16, amount), pitch: lerp(42, 39, amount), zoom: lerp(0.78, 0.8, amount), shiftX: lerp(-54, -42, amount), shiftY: lerp(-38, -27, amount) };
}

function updateLayerClasses(progress) {
  const expanded = progress >= 0.52 && progress < 0.96;
  const investigating = progress >= 0.84;
  layers.forEach((layer, index) => {
    layer.classList.toggle("is-expanded", expanded);
    layer.classList.toggle("is-isolated", investigating);
    layer.classList.toggle("is-focused", investigating && index <= 4);
    layer.classList.toggle("is-hovered", state.hoveredLayer === index && progress >= 0.8);
    layer.classList.toggle("is-dimmed", state.hoveredLayer !== null && state.hoveredLayer !== index && progress >= 0.8);
  });
}

function visibilityForLayer(index, progress) {
  if (index === 0) return 1;
  if (progress < 0.42) return 0;
  if (progress < 0.6) return LAYER_BASE_OPACITY[index] * easeOutCubic((progress - 0.42) / 0.18);
  return LAYER_BASE_OPACITY[index];
}

function traceOpacity(type, progress) {
  if (type === "healthy") return progress < 0.62 ? 0 : 0.2 + 0.36 * easeOutCubic((progress - 0.62) / 0.18);
  if (type === "primary") return progress < 0.24 ? 0 : progress < 0.5 ? 0.45 : progress < 0.72 ? 0.85 : 1;
  if (type === "fault") return progress < 0.58 ? 0 : progress < 0.78 ? easeOutCubic((progress - 0.58) / 0.2) : 1;
  if (type === "challenge") return progress < 0.82 ? 0 : progress < 0.92 ? 0.9 : 0.42;
  if (type === "fix") return progress < 0.91 ? 0 : 0.78;
  if (type === "ambient") return progress < 0.62 ? 0 : 0.16 + 0.28 * easeOutCubic((progress - 0.62) / 0.24);
  return 0;
}

function updateTraces(progress, layerZ, layerOffset) {
  traces.forEach((trace) => {
    const opacity = traceOpacity(trace.definition.type, progress);
    trace.path.style.opacity = opacity;
    trace.path.classList.toggle("is-hidden", opacity < 0.01);
    trace.path.classList.toggle("is-background", trace.definition.type === "healthy");
    trace.path.classList.toggle("is-challenged", trace.definition.type === "challenge" && progress >= 0.92);
    trace.path.classList.toggle("is-fault", trace.definition.type === "fault" || (trace.definition.type === "primary" && progress >= 0.58));
    trace.path.classList.toggle("is-hovered", state.hoveredLayer !== null && (anchors[trace.definition.from].layer === state.hoveredLayer || anchors[trace.definition.to].layer === state.hoveredLayer));
    const signalActive =
      (trace.definition.type === "healthy" && progress >= 0.68) ||
      (trace.definition.type === "fault" && progress >= 0.63) ||
      (trace.definition.type === "primary" && progress >= 0.28) ||
      (trace.definition.type === "challenge" && progress >= 0.84 && progress < 0.94) ||
      (trace.definition.type === "fix" && progress >= 0.92) ||
      (trace.definition.type === "ambient" && progress >= 0.76);
    trace.segments.forEach((segment) => segment.classList.toggle("is-active", signalActive));
  });
  updateTraceGeometry(layerZ, layerOffset);
}

function updatePathHighlights(progress) {
  const activeNodes = new Set();
  const pathNodes = new Set();
  if (progress >= 0.2) pathNodes.add("pricingBtn");
  if (progress >= 0.42) pathNodes.add("pricingDom");
  if (progress >= 0.6) pathNodes.add("brokenRoute");
  if (progress >= 0.72) pathNodes.add("pricingReq");
  if (progress >= 0.82) pathNodes.add("error404");
  if (progress >= 0.88) pathNodes.add("authDep");
  if (progress >= 0.93) pathNodes.add("validRoute");
  if (progress >= 0.2 && progress < 0.34) activeNodes.add("pricingBtn");
  if (progress >= 0.38 && progress < 0.58) activeNodes.add("pricingDom");
  if (progress >= 0.58 && progress < 0.72) activeNodes.add("brokenRoute");
  if (progress >= 0.7 && progress < 0.84) activeNodes.add("pricingReq");
  if (progress >= 0.8) activeNodes.add("error404");
  if (progress >= 0.88 && progress < 0.94) activeNodes.add("authDep");
  if (progress >= 0.93) activeNodes.add("validRoute");

  document.querySelectorAll("[data-node]").forEach((anchorElement) => {
    anchorElement.classList.toggle("is-active", activeNodes.has(anchorElement.dataset.node));
    anchorElement.classList.toggle("is-path-node", pathNodes.has(anchorElement.dataset.node));
  });
  Object.entries(focusElements).forEach(([nodeKey, element]) => {
    element?.classList.toggle("is-active-node", activeNodes.has(nodeKey));
    element?.classList.toggle("is-path-node", pathNodes.has(nodeKey));
  });
}

function updateLayerExploration(progress) {
  const canExplore = progress >= 0.8;
  inspectorPanel.classList.toggle("is-stage-visible", progress >= 0.84);
  layerHoverNote.classList.toggle("is-stage-visible", canExplore);
  if (!canExplore && state.hoveredLayer !== null) {
    state.hoveredLayer = null;
  }
  if (state.hoveredLayer !== null && canExplore) {
    const layer = layers[state.hoveredLayer];
    layerHoverTitle.textContent = layer.dataset.layerTitle;
    layerHoverCopy.textContent = layer.dataset.layerCopy;
  } else {
    layerHoverTitle.textContent = "Hover a layer to see what it represents.";
    layerHoverCopy.textContent = "The expanded structure stays connected. The highlighted path is the synthetic investigation only.";
  }
}

function stageFor(progress) {
  if (progress < 0.2) return { state: "The visible surface", focus: "A familiar website, before the reveal", stage: "01 / 05" };
  if (progress < 0.3) return { state: "A quiet interaction", focus: "The cursor follows the Pricing thread", stage: "02 / 05" };
  if (progress < 0.5) return { state: "Making room underneath", focus: "The camera begins to pull away", stage: "02 / 05" };
  if (progress < 0.65) return { state: "Lifting the surface", focus: "The visible website rises upper-left", stage: "03 / 05" };
  if (progress < 0.85) return { state: "The system unfolds", focus: "Five layers remain one connected website", stage: "04 / 05" };
  return { state: "Veyra follows the evidence", focus: "Observed 404 · scoped recommendation", stage: "05 / 05" };
}

function updateInspector(progress) {
  if (progress < 0.2) {
    inspectorStep.textContent = "01 / SURFACE";
    inspectorHeading.textContent = "A polished page, at first glance.";
    inspectorSummary.textContent = "The CTA looks healthy from the front. Scroll to follow the request behind it.";
    inspectorConclusion.textContent = "Awaiting the route and response relationship.";
  } else if (progress < 0.42) {
    inspectorStep.textContent = "02 / TRIGGER";
    inspectorHeading.textContent = "One interaction opens the thread.";
    inspectorSummary.textContent = "The Pricing CTA is selected as a synthetic starting point. Veyra follows it without claiming a live scan.";
    inspectorConclusion.textContent = "The relationship is visible before a conclusion is made.";
  } else if (progress < 0.65) {
    inspectorStep.textContent = "03 / REVEAL";
    inspectorHeading.textContent = "The surface becomes five systems.";
    inspectorSummary.textContent = "The same CTA stays pinned as its DOM, route, request, and response planes move apart.";
    inspectorConclusion.textContent = "The architecture is connected; the fault path is not yet assigned to a cause.";
  } else if (progress < 0.82) {
    inspectorStep.textContent = "04 / OBSERVE";
    inspectorHeading.textContent = "The request ends at a missing route.";
    inspectorSummary.textContent = "Synthetic observation: the Pricing CTA dispatches GET /api/v2/pricing and receives HTTP 404.";
    inspectorConclusion.textContent = "Observed failure is clear; cause is still open.";
  } else if (progress < 0.92) {
    inspectorStep.textContent = "05 / CHALLENGE";
    inspectorHeading.textContent = "Candidate explanations are checked.";
    inspectorSummary.textContent = "The click listener fires and the auth token is accepted in this synthetic fixture. Neither explains the 404.";
    inspectorConclusion.textContent = "The candidates are challenged, not assumed away.";
  } else {
    inspectorStep.textContent = "06 / VERDICT";
    inspectorHeading.textContent = "The route mismatch is supported.";
    inspectorSummary.textContent = "The component still points to /pricing-v2 while /pricing is the active route. This explains the observed 404 within the fixture's scope.";
    inspectorConclusion.textContent = "Recommended action: update the target and verify the response separately.";
  }

  const clickState = progress < 0.82 ? "PENDING" : progress < 0.92 ? "CHECKING" : "RULED OUT";
  const authState = progress < 0.84 ? "PENDING" : progress < 0.92 ? "CHECKING" : "RULED OUT";
  hypothesisClickState.textContent = clickState;
  hypothesisAuthState.textContent = authState;
  hypothesisClick.classList.toggle("is-active", clickState === "CHECKING");
  hypothesisAuth.classList.toggle("is-active", authState === "CHECKING");
  hypothesisClick.classList.toggle("is-ruled-out", clickState === "RULED OUT");
  hypothesisAuth.classList.toggle("is-ruled-out", authState === "RULED OUT");
  inspectorRecommendation.innerHTML = progress >= 0.92
    ? "Update the target prop from <code>/pricing-v2</code> to <code>/pricing</code>."
    : "The recommendation appears after the route comparison: <code>/pricing-v2</code> → <code>/pricing</code>.";
}

function updateInspection(progress, layerZ, layerOffset) {
  const active = progress >= 0.82;
  const entrance = easeOutCubic((progress - 0.82) / 0.1);
  const visibility = active ? clamp(entrance, 0, 1) : 0;
  const target = pointFor("error404", layerZ, layerOffset);
  inspectionRing.style.opacity = `${visibility}`;
  inspectionRing.style.transform = `translate3d(${target.x}px, ${target.y}px, ${target.z - 8}px) scale(${lerp(0.72, 1, visibility)})`;
  inspectionCallout.style.opacity = "0";

  if (progress < 0.88) {
    calloutTitle.textContent = "Evidence path located";
    calloutBody.textContent = "Pricing CTA dispatched, but the request terminates at a missing route.";
  } else {
    calloutTitle.textContent = "Route mismatch isolated";
    calloutBody.textContent = "The component still points at /pricing-v2; the active target is /pricing.";
  }
}

function updateCursor(progress) {
  const visible = progress >= 0.2 && progress < 0.32;
  const approach = easeOutCubic((progress - 0.2) / 0.06);
  const retreat = progress >= 0.27 ? 1 - easeInOutCubic((progress - 0.27) / 0.05) : 1;
  const visibility = visible ? clamp(Math.min(approach, retreat), 0, 1) : 0;
  const x = lerp(-220, -390, easeOutCubic((progress - 0.2) / 0.1));
  const y = lerp(82, 96, easeOutCubic((progress - 0.2) / 0.1));
  sceneCursor.style.opacity = `${visibility}`;
  sceneCursor.style.transform = `translate3d(${x}px, ${y}px, 18px)`;
  pricingCta.classList.toggle("is-cursor-target", progress >= 0.245 && progress < 0.31);
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
  world.style.setProperty("--scene-zoom", zoom.toFixed(3));
  world.style.setProperty("--scene-shift-x", `${camera.shiftX}px`);
  world.style.setProperty("--scene-shift-y", `${camera.shiftY}px`);

  layers.forEach((layer, index) => {
    layer.style.setProperty("--layer-visibility", visibilityForLayer(index, state.progress).toFixed(3));
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
  focusLabel.textContent = stage.focus;
  scrollStageLabel.textContent = stage.stage;
  scrollProgressBar.style.width = `${(state.progress * 100).toFixed(2)}%`;
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
  const fitWidth = (width - 70) / 1210;
  const fitHeight = (height - 54) / 940;
  const scale = clamp(Math.min(fitWidth, fitHeight), 0.3, 0.82);
  document.documentElement.style.setProperty("--world-scale", scale.toFixed(3));
  syncAnchorSockets();
  requestScrollSync();
}

let resizeFrame = 0;
const resizeObserver = new ResizeObserver(() => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(updateWorldScale);
});
resizeObserver.observe(viewport);

viewport.addEventListener("pointerdown", (event) => {
  if (event.target.closest("button, input, a")) return;
  state.dragging = true;
  state.dragStartX = event.clientX;
  state.dragStartY = event.clientY;
  state.dragYaw = state.manualYaw;
  state.dragPitch = state.manualPitch;
  viewport.classList.add("is-dragging");
  viewport.setPointerCapture(event.pointerId);
});

viewport.addEventListener("pointermove", (event) => {
  if (!state.dragging) return;
  const dx = event.clientX - state.dragStartX;
  const dy = event.clientY - state.dragStartY;
  state.manualYaw = clamp(state.dragYaw + dx * 0.24, -38, 38);
  state.manualPitch = clamp(state.dragPitch - dy * 0.2, -20, 20);
  render();
});

function layerAtPoint(clientX, clientY) {
  if (state.progress < 0.8) return null;
  const candidates = layers
    .map((layer, index) => {
      const rect = layer.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      return { index, distance: Math.hypot(clientX - centerX, clientY - centerY) };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);
  return candidates[0]?.index ?? null;
}

viewport.addEventListener("pointermove", (event) => {
  if (state.dragging || state.progress < 0.8) return;
  const layerIndex = layerAtPoint(event.clientX, event.clientY);
  if (layerIndex === state.hoveredLayer) return;
  if (layerIndex === null) {
    clearHoveredLayer();
  } else {
    setHoveredLayer(layerIndex);
  }
});

viewport.addEventListener("pointerleave", () => {
  if (!state.dragging) clearHoveredLayer();
});

function endDrag(event) {
  if (!state.dragging) return;
  state.dragging = false;
  viewport.classList.remove("is-dragging");
  if (event?.pointerId !== undefined && viewport.hasPointerCapture(event.pointerId)) {
    viewport.releasePointerCapture(event.pointerId);
  }
}

viewport.addEventListener("pointerup", endDrag);
viewport.addEventListener("pointercancel", endDrag);

viewport.addEventListener("keydown", (event) => {
  const step = event.shiftKey ? 8 : 4;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    state.manualYaw = clamp(state.manualYaw + (event.key === "ArrowLeft" ? -step : step), -38, 38);
    render();
  } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    event.preventDefault();
    state.manualPitch = clamp(state.manualPitch + (event.key === "ArrowUp" ? step : -step), -20, 20);
    render();
  } else if (event.key === "Home") {
    event.preventDefault();
    state.manualYaw = 0;
    state.manualPitch = 0;
    render();
  }
});

function setHoveredLayer(layerIndex) {
  if (state.progress < 0.8) return;
  state.hoveredLayer = layerIndex;
  layerHoverNote.classList.add("is-hovered");
  updateLayerExploration(state.progress);
  render();
}

function clearHoveredLayer() {
  state.hoveredLayer = null;
  layerHoverNote.classList.remove("is-hovered");
  updateLayerExploration(state.progress);
  render();
}

layers.forEach((layer, index) => {
  layer.addEventListener("pointerenter", () => setHoveredLayer(index));
  layer.addEventListener("pointerleave", clearHoveredLayer);
  layer.addEventListener("focus", () => setHoveredLayer(index));
  layer.addEventListener("blur", clearHoveredLayer);
});

window.addEventListener("scroll", requestScrollSync, { passive: true });
window.addEventListener("resize", requestScrollSync);
prefersReducedMotion.addEventListener?.("change", requestScrollSync);

syncAnchorSockets();
updateWorldScale();
render(0);
