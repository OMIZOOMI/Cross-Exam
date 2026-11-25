"use client";

import { validateTargetUrl } from "@crossexam/engine/url-policy";
import { ArrowRight, Globe2, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";

const bareDomain =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?(?=[/?#]|$)/i;

export function ScanForm({ repeat }: { repeat?: { targetUrl: string; reportId: string } } = {}) {
  const [url, setUrl] = useState(repeat?.targetUrl ?? "");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const router = useRouter();
  useEffect(() => () => controller.current?.abort(), []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (controller.current) return;
    const trimmed = (repeat?.targetUrl ?? url).trim();
    const targetUrl = bareDomain.test(trimmed) ? `https://${trimmed}` : trimmed;
    const decision = validateTargetUrl(targetUrl);
    if (!decision.ok || URL.parse(decision.url)?.search) {
      setInvalid(true);
      setFeedback(
        decision.ok
          ? "Remove the question mark and everything after it, then try again."
          : ["INVALID_INPUT", "MALFORMED_URL", "INVALID_HOSTNAME"].includes(decision.reason)
            ? "Check the address and try again. For example, example.com."
            : "This destination cannot be scanned.",
      );
      return;
    }
    setInvalid(false);
    setPending(true);
    setFeedback("Checking your website…");
    const active = new AbortController();
    controller.current = active;
    try {
      // Same-origin application API only. The browser never contacts the entered destination.
      const response = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUrl }),
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
      const previous = repeat ? `?previous=${encodeURIComponent(repeat.reportId)}` : "";
      router.push(`/report/${encodeURIComponent(result.id)}${previous}`);
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
  if (repeat) {
    return (
      <form className="report-rescan" onSubmit={submit}>
        <button type="submit" className="button button-primary" disabled={pending}>
          {pending ? "Scanning again…" : "Scan again"}
        </button>
        {feedback && <p role="status">{feedback}</p>}
        {pending && (
          <button type="button" className="text-link" onClick={() => controller.current?.abort()}>
            Cancel
          </button>
        )}
      </form>
    );
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
          {pending ? "Scanning…" : "Scan website"} <ArrowRight size={17} />
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
          Checks up to 8 pages. Browser and AI analysis are unavailable.
        </p>
      )}
    </div>
  );
}
