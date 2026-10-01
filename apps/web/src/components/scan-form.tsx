"use client";

import { validateTargetUrl } from "@crossexam/engine/url-policy";
import { ArrowRight, Globe2, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";

export function ScanForm() {
  const [url, setUrl] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const router = useRouter();
  useEffect(() => () => controller.current?.abort(), []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (controller.current) return;
    const decision = validateTargetUrl(url);
    if (!decision.ok) {
      setInvalid(true);
      setFeedback(
        ["INVALID_INPUT", "MALFORMED_URL"].includes(decision.reason)
          ? "Enter a full HTTP or HTTPS URL without embedded credentials."
          : "This destination cannot be scanned.",
      );
      return;
    }
    setInvalid(false);
    setPending(true);
    setFeedback("Reading the website and collecting document evidence…");
    const active = new AbortController();
    controller.current = active;
    try {
      // Same-origin application API only. The browser never contacts the entered destination.
      const response = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUrl: url }),
        signal: active.signal,
      });
      const result = await response.json();
      if (!response.ok || typeof result.id !== "string") {
        setInvalid(true);
        setFeedback(
          typeof result.message === "string"
            ? result.message
            : "The investigation could not be completed. Please try again.",
        );
        return;
      }
      setFeedback("Preparing your report…");
      router.push(`/report/${encodeURIComponent(result.id)}`);
    } catch {
      setFeedback(
        active.signal.aborted
          ? "Investigation cancelled."
          : "The investigation could not be completed. Please try again.",
      );
    } finally {
      controller.current = null;
      setPending(false);
    }
  }
  return (
    <div className="scan-form-wrap">
      <form className="scan-form" onSubmit={submit} noValidate>
        <label className="sr-only" htmlFor="target-url">
          Website URL
        </label>
        <Globe2 size={19} aria-hidden="true" />
        <input
          id="target-url"
          name="url"
          type="url"
          value={url}
          disabled={pending}
          onChange={(event) => {
            setUrl(event.target.value);
            setFeedback(null);
            setInvalid(false);
          }}
          placeholder="https://your-website.com"
          autoComplete="url"
          spellCheck={false}
          aria-describedby={feedback ? "scan-feedback" : "scan-note"}
          aria-invalid={invalid}
          required
        />
        <button className="button button-primary" type="submit" disabled={pending}>
          {pending ? "Investigating…" : "Begin Cross-Exam"} <ArrowRight size={17} />
        </button>
      </form>
      {feedback ? (
        <div
          id="scan-feedback"
          className={`form-feedback ${invalid ? "invalid" : ""}`}
          role="status"
        >
          <Info size={16} />
          <span>{feedback}</span>
          {pending && (
            <button type="button" className="text-link" onClick={() => controller.current?.abort()}>
              Cancel
            </button>
          )}
        </div>
      ) : (
        <p id="scan-note" className="form-note">
          <span className="tiny-dot" />
          Read-only HTML investigation · Up to 8 pages · No browser or AI agents
        </p>
      )}
    </div>
  );
}
