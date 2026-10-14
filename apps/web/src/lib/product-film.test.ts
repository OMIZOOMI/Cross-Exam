import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEMO,
  depthAt,
  FILM,
  LAYERS,
  SHOTS,
  shotAt,
  trailPositionAt,
} from "../../../../tools/veyra-film/src/story";

describe("the Veyra product film", () => {
  it("covers exactly 35 seconds without gaps, with a held brand frame", () => {
    expect(FILM.frames / FILM.fps).toBe(35);
    expect([FILM.width, FILM.height]).toEqual([1920, 1080]);
    for (const [i, shot] of SHOTS.entries()) {
      expect(shot.end).toBeGreaterThan(shot.start);
      expect(shot.start).toBe(i ? SHOTS[i - 1]?.end : 0);
      expect(shotAt((shot.start + shot.end) / 2)).toBe(shot);
    }
    expect(SHOTS[8].end).toBe(35);
  });
  it("starts assembled, exposes six layers and reassembles before the brand", () => {
    expect(depthAt(0)).toBe(0);
    expect(depthAt(10)).toBe(1);
    expect(depthAt(33.3)).toBe(0);
    expect(LAYERS).toEqual([
      "UI",
      "STRUCTURE",
      "COMPONENTS",
      "RESOURCES",
      "DEPENDENCIES",
      "EVIDENCE",
    ]);
  });
  it("labels the scenario synthetic and recommends verification without repair", () => {
    expect(DEMO.source).toContain("NOT A LIVE SCAN");
    expect(DEMO.verdict).toContain("DEMO VERDICT");
    expect(DEMO.recommendation).toContain("Verify");
    expect(DEMO.challenge).toContain("not causality");
  });
  it("propagates the problem down and traces back from evidence to the source", () => {
    expect(trailPositionAt(12.35)).toBe(0);
    expect(trailPositionAt(14.9)).toBe(5);
    expect(trailPositionAt(26.2)).toBe(5);
    expect(trailPositionAt(29)).toBe(0);
  });
  it("ships bounded, independent MP4 and WebP assets with progressive MP4 metadata", () => {
    const mp4 = readFileSync(new URL("../../public/media/veyra-product-film.mp4", import.meta.url));
    expect(mp4.subarray(4, 8).toString()).toBe("ftyp");
    expect(mp4.indexOf("avc1")).toBeGreaterThan(0);
    expect(mp4.indexOf("moov")).toBeGreaterThan(0);
    expect(mp4.indexOf("moov")).toBeLessThan(mp4.indexOf("mdat"));
    expect(mp4.length).toBeLessThan(12 * 1024 * 1024);
    const poster = readFileSync(
      new URL("../../public/media/veyra-product-film-poster.webp", import.meta.url),
    );
    expect(poster.subarray(0, 4).toString()).toBe("RIFF");
    expect(poster.subarray(8, 12).toString()).toBe("WEBP");
    expect(
      statSync(new URL("../../public/media/veyra-product-film-poster.webp", import.meta.url)).size,
    ).toBeLessThan(400 * 1024);
  });
});
