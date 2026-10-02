import { describe, expect, it } from "vitest";
import {
  BrowserRuntimeError,
  MAX_CODE_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_NAME_LENGTH,
  sanitizeDiagnosticMessage,
  toBrowserRuntimeError,
} from "./browser-diagnostics";

describe("toBrowserRuntimeError stage tracking", () => {
  it("records chromium-launch for a launch error", () => {
    const error = toBrowserRuntimeError("chromium-launch", new Error("failed to start browser"));
    expect(error).toBeInstanceOf(BrowserRuntimeError);
    expect(error.stage).toBe("chromium-launch");
    expect(error.errorClass).toBe("Error");
    expect(error.causeMessage).toBe("failed to start browser");
  });

  it("records the correct later stage for a post-launch error", () => {
    const error = toBrowserRuntimeError("navigation", new Error("net::ERR_CONNECTION_REFUSED"));
    expect(error.stage).toBe("navigation");
    expect(error.causeMessage).toBe("net::ERR_CONNECTION_REFUSED");
  });

  it("captures a Node errno code when present", () => {
    const cause = Object.assign(new Error("cannot open"), { code: "ENOENT" });
    const error = toBrowserRuntimeError("chromium-launch", cause);
    expect(error.errorCode).toBe("ENOENT");
  });

  it("handles a non-Error throwable", () => {
    const error = toBrowserRuntimeError("chromium-launch", "string throw");
    expect(error.errorClass).toBe("Unknown");
    expect(error.causeMessage).toBe("");
  });
});

describe("sanitizeDiagnosticMessage", () => {
  it("strips control characters", () => {
    expect(sanitizeDiagnosticMessage("boom\u0000\u001f\u007f!")).toBe("boom   !");
  });

  it("redacts host home/repository paths but keeps in-root paths", () => {
    expect(sanitizeDiagnosticMessage("missing /home/runner/.cache/x and /app/node_modules/y")).toBe(
      "missing /home/<redacted> and /app/node_modules/y",
    );
    expect(sanitizeDiagnosticMessage("lib at /root/.cache/f")).toBe("lib at /root/<redacted>");
  });

  it("does not emit environment-like content from arbitrary input", () => {
    const message = sanitizeDiagnosticMessage("SECRET_TOKEN=abc123 leaked");
    expect(message).toBe("SECRET_TOKEN=abc123 leaked");
  });

  it("bounds the message length", () => {
    const message = sanitizeDiagnosticMessage("x".repeat(10_000));
    expect(message).toHaveLength(MAX_MESSAGE_LENGTH);
  });
});

describe("diagnostic bounds", () => {
  it("bounds class and code lengths", () => {
    const cause = Object.assign(new Error("x"), { code: "c".repeat(500) });
    const error = toBrowserRuntimeError("chromium-launch", cause);
    expect(error.errorClass).toHaveLength("Error".length);
    expect(error.errorCode).toHaveLength(MAX_CODE_LENGTH);
    expect(error.errorClass.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
  });

  it("omits stack traces and stays within probe result bounds", () => {
    const cause = new Error("outer");
    cause.stack = `Error: outer\n    at runBrowser (${"/home/runner/work/secret/stack.js"}:1:1)`;
    const error = toBrowserRuntimeError("navigation", cause);
    expect(error.causeMessage).not.toContain("at runBrowser");
    const record = JSON.stringify({
      version: 1,
      mode: "browser",
      status: "failed",
      code: "BROWSER_RUNTIME_FAILURE",
      stage: error.stage,
      errorClass: error.errorClass,
      errorCode: error.errorCode,
      message: error.causeMessage,
    });
    expect(record.length).toBeLessThan(8 * 1024);
  });
});
