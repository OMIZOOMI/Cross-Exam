"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const FILE = "/media/veyra-product-film.mp4";

export function ProductFilm() {
  const video = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReduced(preference.matches);
      if (preference.matches && video.current) {
        video.current.pause();
        video.current.removeAttribute("src");
        video.current.load();
        setStarted(false);
        setEnded(false);
      }
    };
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  async function toggle() {
    const element = video.current;
    if (!element) return;
    if (playing) return element.pause();
    setFailed(false);
    if (!element.getAttribute("src")) {
      element.src = FILE;
      element.load();
    }
    if (ended) element.currentTime = 0;
    setStarted(true);
    setEnded(false);
    try {
      await element.play();
    } catch {
      setFailed(true);
    }
  }
  const label = ended
    ? "Replay product film"
    : playing
      ? "Pause product film"
      : "Play product film";
  return (
    <figure className="stage182-film" aria-labelledby="film-title">
      <div className="stage182-film-bar">
        <span id="film-title">01 / Behind the surface</span>
        <span>35 SEC · SYNTHETIC DEMO</span>
      </div>
      <div className="stage182-film-surface" data-reduced-motion={reduced}>
        <video
          ref={video}
          aria-label="Veyra: Behind the surface — synthetic product film"
          aria-describedby="film-summary"
          poster="/media/veyra-product-film-poster.webp"
          width={1920}
          height={1080}
          preload="none"
          muted
          playsInline
          controls={started}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setEnded(true);
            setPlaying(false);
          }}
          onError={() => setFailed(true)}
        />
        {!started && (
          <button
            className="stage182-film-play"
            type="button"
            onClick={toggle}
            aria-label="Play product film"
          >
            <Play size={22} aria-hidden="true" fill="currentColor" /> Watch the film{" "}
            <span>00:35</span>
          </button>
        )}
      </div>
      <figcaption>
        <div className="stage182-film-footer">
          <p id="film-summary">A website is a connected system. Look inside it.</p>
          <button
            type="button"
            onClick={toggle}
            className="stage182-film-toggle"
            aria-label={label}
          >
            {ended ? <RotateCcw size={16} /> : playing ? <Pause size={16} /> : <Play size={16} />}{" "}
            {label}
          </button>
        </div>
        {failed && (
          <p role="status">
            Playback is unavailable. <a href={FILE}>Open the MP4 directly</a> or read the film
            below.
          </p>
        )}
        <details className="stage182-film-transcript">
          <summary>Read the film · text equivalent</summary>
          <p>
            Your website looks fine. But there’s more behind the surface. A polished synthetic
            website separates into connected UI, structure, component, resource, dependency and
            evidence layers.
          </p>
          <p>
            Problems hide between the layers. In this fictional system, the page still renders while
            a stale hero-asset reference returns 404. A red pulse follows that relationship. Veyra’s
            orange inspection plane moves through the cross-section and attaches blue evidence to
            the path.
          </p>
          <p>
            A claim says a slow script explains the missing hero. A challenge points to the 404
            response: timing alone is not causality. That first explanation is withdrawn. The
            surviving evidence path returns to the hero component’s stale asset reference.
          </p>
          <p>
            The scoped demo verdict identifies the stale reference. What happened: the referenced
            asset is unavailable. Why: the component points to an old path. Recommended fix: update
            the reference and verify the asset response. No code is automatically changed.
          </p>
          <p>
            The layers reassemble. Veyra. Your website says it works. Prove it. Evidence-backed
            website investigations.
          </p>
          <p>
            This film is a synthetic illustration, not a live scan, model run or observed
            reproduction. Public browser scanning and real providers remain unavailable here.
          </p>
        </details>
        <noscript>
          <p>
            JavaScript is disabled. <a href={FILE}>Open the independent MP4</a>, or read the text
            equivalent.
          </p>
        </noscript>
      </figcaption>
    </figure>
  );
}
