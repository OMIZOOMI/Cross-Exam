import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hash } from "../../packages/agents/src/provider";
import * as releases from "../../packages/controlled-provider/src/release";
import { RunStore } from "../../packages/controlled-provider/src/storage";
import { validTransport } from "../../packages/provider-openai/src/test-fixtures";
import {
  previewAcceptance,
  renderOperatorOutput,
  runOperator,
  safeOperatorError,
} from "./operator";

const directories: string[] = [];
const directory = async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "crossexam-operator-"));
  directories.push(dir);
  return dir;
};
// Synthetic offline placeholder, not a credential. Every execute uses injected transport.
const readCredential = () => "offline-operator-placeholder";
const execute = ["execute", "--release-id", "operator-test-release"];
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("NO_NETWORK_IN_TESTS");
    }),
  ),
);
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe("credential-free owned preview", () => {
  it("makes no calls, creates no release and writes no storage", async () => {
    const dir = await directory();
    const key = vi.fn(() => {
      throw new Error("CREDENTIAL_MUST_NOT_BE_READ");
    });
    const transport = vi.fn(validTransport());
    const release = vi.spyOn(releases, "createControlledRelease");
    const open = vi.spyOn(RunStore.prototype, "openRun");
    const out = await runOperator(["preview"], { directory: dir, readCredential: key, transport });
    expect(out.operation).toBe("preview");
    expect(key).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(await readdir(dir)).toEqual([]);
  });
  it("is stable, complete, correctly hashed and under 16 KiB", () => {
    const p = previewAcceptance();
    expect(p).toEqual(previewAcceptance());
    expect(Object.isFrozen(p.explorer)).toBe(true);
    expect(p.fixture.snapshotHash).toBe(releases.fixtureSnapshotHash());
    expect(p.fixture.key).toBe("owned-numeric-tribunal-v1");
    expect(p.explorer.bytes).toBe(Buffer.byteLength(p.explorer.body));
    expect(p.explorer.requestHash).toBe(hash(p.explorer.body));
    expect(p.explorer.bytes).toBeLessThanOrEqual(16384);
    expect(JSON.parse(p.explorer.body)).toMatchObject({
      model: "gpt-6-luna",
      store: false,
      stream: false,
      reasoning: { effort: "none", mode: "standard" },
    });
    expect(p.explorer.body).not.toContain("scan-owned-numeric");
    expect(p.explorer.body).not.toContain("controlled.fixture.test");
  });
  it("does not invent a Breaker body or claims", () => {
    const p = previewAcceptance();
    expect(p.breaker.exactBodyAvailable).toBe(false);
    expect(p.breaker).not.toHaveProperty("body");
    expect(p.breaker).not.toHaveProperty("claims");
    expect(p.breaker.claimFields).toEqual([
      "id",
      "statement",
      "scope",
      "falsifier",
      "evidenceIds",
      "provenance",
    ]);
    expect(p.breaker.exportPolicy).toBe("external-numeric-presence-v1");
    expect(p.breaker.maximumBytes).toBe(16384);
  });
  it("renders the exact transport JSON without changing its bytes", () => {
    const p = previewAcceptance();
    const rendered = renderOperatorOutput(p);
    const body = rendered
      .split("--- BEGIN EXPLORER BODY ---\n")[1]
      ?.split("\n--- END EXPLORER BODY ---")[0];
    expect(body).toBe(p.explorer.body);
  });
  it("the owner's packet contains this exact fixture and complete outbound body", async () => {
    const p = previewAcceptance();
    const packet = await readFile(
      path.resolve(import.meta.dirname, "../../docs/STAGE14C_ACCEPTANCE.md"),
      "utf8",
    );
    const body = packet.split("```json\n")[1]?.split("\n```")[0];
    expect(body).toBe(p.explorer.body);
    expect(packet).toContain(p.fixture.snapshotHash);
    expect(packet).toContain(p.explorer.requestHash);
    expect(packet).toContain(`${p.explorer.bytes} UTF-8 bytes`);
  });
  it("the actual CLI preview is keyless and leaves its working directory untouched", async () => {
    const dir = await directory();
    const root = path.resolve(import.meta.dirname, "../..");
    const out = await promisify(execFile)(
      process.execPath,
      [
        path.join(root, "node_modules/tsx/dist/cli.mjs"),
        path.join(root, "scripts/provider-acceptance.ts"),
        "preview",
      ],
      { cwd: dir },
    );
    expect(out.stderr).toBe("");
    expect(out.stdout).toContain(previewAcceptance().explorer.body);
    expect(await readdir(dir)).toEqual([]);
  });
});

describe("explicit fixed-profile execution", () => {
  it.each(
    [
      [],
      ["execute"],
      ["execute", "--release-id"],
      ["execute", "--release-id", ""],
      ["execute", "--release-id", "../escape"],
      ["preview", "--release-id", "wrong"],
      ["execute", "--model", "other"],
      [...execute, "--endpoint", "https://other.test"],
      [...execute, "--api-key", "DO_NOT_PRINT"],
    ].map((args) => ({ args })),
  )(
    "rejects invalid arguments before credential lookup or reservation: $args",
    async ({ args }) => {
      const dir = await directory();
      const key = vi.fn(readCredential);
      const transport = vi.fn(validTransport());
      await expect(
        runOperator(args, { readCredential: key, transport, directory: dir }),
      ).rejects.toThrow("OPERATOR_ARGUMENTS");
      expect(key).not.toHaveBeenCalled();
      expect(transport).not.toHaveBeenCalled();
      expect(await readdir(dir)).toEqual([]);
    },
  );
  it.each([undefined, "", " ", "bad\nvalue", "x".repeat(4097)])(
    "rejects missing/invalid configuration before release consumption",
    async (key) => {
      const dir = await directory();
      const transport = vi.fn(validTransport());
      await expect(
        runOperator(execute, { readCredential: () => key, transport, directory: dir }),
      ).rejects.toThrow("OPERATOR_CONFIGURATION");
      expect(transport).not.toHaveBeenCalled();
      expect(await readdir(dir)).toEqual([]);
    },
  );
  it("credential bootstrap exceptions never leak their text", async () => {
    let caught: unknown;
    try {
      await runOperator(execute, {
        readCredential: () => {
          throw new Error("PRIVATE_BOOTSTRAP_TEXT");
        },
      });
    } catch (error) {
      caught = error;
    }
    expect(safeOperatorError(caught).error).toBe("OPERATOR_CONFIGURATION");
    expect(JSON.stringify(safeOperatorError(caught))).not.toContain("PRIVATE_BOOTSTRAP_TEXT");
    expect(safeOperatorError(new Error("PRIVATE_PROVIDER_TEXT")).error).toBe("OPERATOR_FAILED");
  });
  it("requires an explicit credential callback even with a fake transport", async () => {
    const dir = await directory();
    const transport = vi.fn(validTransport());
    await expect(runOperator(execute, { transport, directory: dir })).rejects.toThrow(
      "OPERATOR_CONFIGURATION",
    );
    expect(transport).not.toHaveBeenCalled();
    expect(await readdir(dir)).toEqual([]);
  });
  it("provider failure is sanitized and never retried by a repeated command", async () => {
    const dir = await directory();
    const transport = vi.fn(async () => {
      throw new Error("PRIVATE_PROVIDER_EXCEPTION");
    });
    const deps = { readCredential, transport, directory: dir };
    const first = await runOperator(execute, deps);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(first)).not.toContain("PRIVATE_PROVIDER_EXCEPTION");
    if (first.operation !== "execute") throw new Error("TEST_OPERATION");
    expect(first.roles[0]?.status).toBe("transport-failure");
    expect(await runOperator(execute, deps)).toEqual(first);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("caller cancellation retains a recoverable receipt without another dispatch", async () => {
    const dir = await directory();
    const controller = new AbortController();
    const transport = vi.fn(async () => {
      controller.abort();
      throw new Error("SYNTHETIC_CANCELLED_RESPONSE");
    });
    const deps = { readCredential, transport, directory: dir, signal: controller.signal };
    const first = await runOperator(execute, deps);
    if (first.operation !== "execute") throw new Error("TEST_OPERATION");
    expect(first.roles[0]?.status).toBe("aborted");
    expect(await runOperator(execute, deps)).toEqual(first);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await readdir(path.join(dir, "operator-test-release"))).not.toContain("owner.lock");
  });
  it("simulates exactly one call per role with the reviewed request and fixed settings", async () => {
    const dir = await directory();
    const bodies: string[] = [];
    const transport = vi.fn(validTransport((b) => bodies.push(b)));
    const deps = { directory: dir, readCredential, transport };
    const out = await runOperator(execute, deps);
    expect(out.operation).toBe("execute");
    if (out.operation !== "execute") throw new Error("TEST_OPERATION");
    expect(out.status).toBe("completed");
    expect(out.roles).toEqual([
      { role: "Explorer", status: "completed", calls: 1, acceptedCount: 1 },
      { role: "Breaker", status: "completed", calls: 1, acceptedCount: 1 },
    ]);
    expect(bodies[0]).toBe(previewAcceptance().explorer.body);
    for (const [i, body] of bodies.entries()) {
      const req = JSON.parse(body);
      expect(req.model).toBe("gpt-6-luna");
      expect(req.reasoning).toEqual({ effort: "none", mode: "standard" });
      expect(req.service_tier).toBe("default");
      expect(req.max_output_tokens).toBe(i === 0 ? 768 : 1024);
      expect(req.store).toBe(false);
      expect(req.stream).toBe(false);
      expect(req.truncation).toBe("disabled");
      expect(Buffer.byteLength(body)).toBeLessThanOrEqual(16384);
      expect(body).not.toContain(readCredential());
      expect(transport.mock.calls[i]?.[0]).toBe("https://api.openai.com/v1/responses");
      expect(transport.mock.calls[i]?.[1]?.redirect).toBe("manual");
    }
    expect(transport).toHaveBeenCalledTimes(2);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    const repeat = await runOperator(execute, deps);
    expect(repeat).toEqual(out);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(renderOperatorOutput(out)).not.toContain("The owned response fixture");
    expect(renderOperatorOutput(out)).not.toContain("DISCARD_REASONING");
    expect(renderOperatorOutput(out)).not.toContain(readCredential());
    // Only read synthetic test artifacts, never a real controlled run or credential.
    for (const name of await readdir(dir)) {
      expect(name).toBe("operator-test-release");
      for (const file of await readdir(path.join(dir, name))) {
        const text = await readFile(path.join(dir, name, file), "utf8");
        expect(text).not.toContain(readCredential());
        expect(text).not.toContain("DISCARD_REASONING");
        expect(text).not.toContain("Authorization");
      }
    }
  });
  it.each([
    "Explorer:dispatch-consumed",
    "Explorer:checkpoint-durable",
    "Breaker:dispatch-consumed",
    "before-final-publication",
  ])("interrupted release at %s recovers without redispatch", async (point) => {
    const dir = await directory();
    const transport = vi.fn(validTransport());
    let interrupted = false;
    vi.spyOn(RunStore.prototype, "point").mockImplementation(async (name) => {
      if (name === point && !interrupted) {
        interrupted = true;
        throw new Error("SIMULATED_INTERRUPTION");
      }
    });
    const deps = { directory: dir, readCredential, transport };
    await expect(runOperator(execute, deps)).rejects.toThrow("STORE_IO");
    const calls = transport.mock.calls.length;
    const recovered = await runOperator(execute, deps);
    if (recovered.operation !== "execute") throw new Error("TEST_OPERATION");
    expect(transport).toHaveBeenCalledTimes(calls);
    expect(recovered.status).toBe(
      point === "before-final-publication"
        ? "completed"
        : point === "Explorer:checkpoint-durable"
          ? "interrupted"
          : "outcome-unknown",
    );
    expect(await runOperator(execute, deps)).toEqual(recovered);
    expect(transport).toHaveBeenCalledTimes(calls);
  });
});
