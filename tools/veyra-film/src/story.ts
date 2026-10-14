export const FILM = { width: 1920, height: 1080, fps: 30, seconds: 35, frames: 1050 } as const;
export const LAYERS = [
  "UI",
  "STRUCTURE",
  "COMPONENTS",
  "RESOURCES",
  "DEPENDENCIES",
  "EVIDENCE",
] as const;
export const SHOTS = [
  {
    start: 0,
    end: 4,
    label: "01 / THE SURFACE",
    lines: ["YOUR WEBSITE", "LOOKS FINE."],
    note: "A polished surface is only the beginning.",
  },
  {
    start: 4,
    end: 8,
    label: "02 / THE CROSS-SECTION",
    lines: ["BUT THERE’S MORE", "BEHIND THE", "SURFACE."],
    note: "Six layers. One connected system.",
  },
  {
    start: 8,
    end: 12,
    label: "03 / THE CONNECTIONS",
    lines: ["ONE PAGE.", "A CONNECTED", "SYSTEM."],
    note: "Page → component → request → resource → evidence.",
  },
  {
    start: 12,
    end: 16,
    label: "04 / THE HIDDEN RELATIONSHIP",
    lines: ["PROBLEMS HIDE", "BETWEEN THE", "LAYERS."],
    note: "Demo: the page renders. A referenced asset returns 404.",
  },
  {
    start: 16,
    end: 22,
    label: "05 / VEYRA INVESTIGATES",
    lines: ["LOOK INSIDE.", "KEEP THE", "EVIDENCE."],
    note: "An inspection field follows the connected record.",
  },
  {
    start: 22,
    end: 26,
    label: "06 / CLAIM + CHALLENGE",
    lines: ["A CLAIM.", "A CHALLENGE.", "A CLEARER PATH."],
    note: "The first explanation must survive the evidence.",
  },
  {
    start: 26,
    end: 30,
    label: "07 / FOLLOW THE EVIDENCE",
    lines: ["FIND THE CAUSE.", "NOT JUST THE", "SYMPTOM."],
    note: "In this synthetic system: hero → stale reference → 404.",
  },
  {
    start: 30,
    end: 33,
    label: "08 / A SCOPED ANSWER",
    lines: ["WHAT HAPPENED.", "WHY IT HAPPENED.", "WHAT TO FIX."],
    note: "A recommendation. Never an automatic repair.",
  },
  {
    start: 33,
    end: 35,
    label: "09 / VEYRA",
    lines: ["VEYRA"],
    note: "Evidence-backed website investigations.",
  },
] as const;
export const DEMO = {
  source: "SYNTHETIC DEMO · NOT A LIVE SCAN",
  claim: "A slow script explains the missing hero.",
  challenge: "The asset returned 404. Timing alone is not causality.",
  verdict: "DEMO VERDICT / STALE ASSET REFERENCE",
  recommendation: "Update the reference. Verify the asset response.",
} as const;
export const clamp = (n: number) => Math.max(0, Math.min(1, n));
export const ease = (t: number, start: number, end: number) => {
  const n = clamp((t - start) / (end - start));
  return n * n * (3 - 2 * n);
};
export function shotAt(t: number) {
  return SHOTS.find((shot) => t >= shot.start && t < shot.end) ?? SHOTS[8];
}
export function depthAt(t: number) {
  return ease(t, 4, 7.4) * (1 - ease(t, 31.6, 33.2));
}
export function trailPositionAt(t: number) {
  // The problem propagates down; investigation returns from evidence toward its source.
  return t >= 26 ? (1 - clamp((t - 26.2) / 2.5)) * 5 : clamp((t - 12.35) / 2.5) * 5;
}
