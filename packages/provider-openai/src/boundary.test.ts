import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeDispatch, hash } from "../../agents/src/provider";
import { createOpenAIProvider } from "./index";
import { completed, jsonResponse, providerRequest, validTransport } from "./test-fixtures";
import { prepareWire } from "./wire";

afterEach(() => vi.useRealTimers());
describe("SDK admission and transport policy", () => {
  it("preserves bounded usage on incomplete output without authorizing its partial text", async () => {
    const req = providerRequest();
    const transport: typeof fetch = async () =>
      jsonResponse({
        ...completed(undefined, {
          input_tokens: 10,
          output_tokens: 768,
          output_tokens_details: { reasoning_tokens: 100 },
        }),
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
      });
    const result = await createOpenAIProvider({ transport }).adapter?.run(req, {
      signal: new AbortController().signal,
      authorization: authorizeDispatch(prepareWire(req).requestHash),
    });
    expect(result).toMatchObject({
      kind: "failure",
      category: "incomplete",
      usage: { inputTokens: 10, outputTokens: 768, reasoningTokens: 100 },
    });
    expect(result).not.toHaveProperty("payload");
  });
  it.each(["invalid", []])("rejects present malformed usage %j", async (usage) => {
    const req = providerRequest();
    const transport: typeof fetch = async () => jsonResponse(completed(undefined, usage));
    const result = await createOpenAIProvider({ transport }).adapter?.run(req, {
      signal: new AbortController().signal,
      authorization: authorizeDispatch(prepareWire(req).requestHash),
    });
    expect(result).toMatchObject({ category: "usage-error" });
  });
  it("direct adapter invocation cannot dispatch without a durable host capability", async () => {
    const transport = vi.fn(validTransport());
    const result = await createOpenAIProvider({ transport }).adapter?.run(providerRequest(), {
      signal: new AbortController().signal,
    });
    expect(result).toMatchObject({ category: "missing-configuration" });
    expect(transport).not.toHaveBeenCalled();
  });
  it("fabricated, wrong-hash, or replayed authorizations cannot issue a call", async () => {
    const transport = vi.fn(validTransport());
    const config = createOpenAIProvider({ transport });
    const req = providerRequest();
    for (const auth of [
      { kind: "durable-host-dispatch-v1" },
      authorizeDispatch(hash("another body")),
    ])
      await config.adapter?.run(req, {
        signal: new AbortController().signal,
        authorization: auth as never,
      });
    expect(transport).not.toHaveBeenCalled();
    const authorization = authorizeDispatch(prepareWire(req).requestHash);
    await config.adapter?.run(req, { signal: new AbortController().signal, authorization });
    await config.adapter?.run(req, { signal: new AbortController().signal, authorization });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("oversized/unknown incoming request is rejected before serialization/SDK", () => {
    const req = structuredClone(providerRequest());
    if (req.view.evidence[0]) req.view.evidence[0].title = "x".repeat(160 * 1024);
    expect(() => prepareWire(req)).toThrow();
    expect(() =>
      prepareWire({ ...providerRequest(), baseURL: "https://unapproved.test/" } as never),
    ).toThrow();
  });
  it("chunked successful/error bodies exceeding bounds never become proposals", async () => {
    for (const status of [200, 429]) {
      const transport = vi.fn<typeof fetch>(
        async () =>
          new Response(
            new ReadableStream({
              start(c) {
                c.enqueue(new Uint8Array(status === 200 ? 128 * 1024 + 1 : 8 * 1024 + 1));
                c.close();
              },
            }),
            { status },
          ),
      );
      const req = providerRequest();
      const result = await createOpenAIProvider({ transport }).adapter?.run(req, {
        signal: new AbortController().signal,
        authorization: authorizeDispatch(prepareWire(req).requestHash),
      });
      expect(result).toMatchObject({ category: "limit" });
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });
  it("rejects late transport after 18 seconds even if injected transport ignores abort", async () => {
    vi.useFakeTimers();
    let resolve: (r: Response) => void = () => {};
    const transport = vi.fn<typeof fetch>(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const req = providerRequest();
    const promise = createOpenAIProvider({ transport }).adapter?.run(req, {
      signal: new AbortController().signal,
      authorization: authorizeDispatch(prepareWire(req).requestHash),
    });
    await vi.advanceTimersByTimeAsync(18001);
    expect(await promise).toMatchObject({ category: "timeout" });
    resolve(jsonResponse(completed()));
    await vi.advanceTimersByTimeAsync(0);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not change fixed body under untrusted bootstrap data or envelope fields", async () => {
    const req = providerRequest();
    const transport = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        ...completed(),
        model: "malicious-model",
        tools: ["forbidden"],
        metadata: { id: "MODEL_ID" },
        reasoning: { summary: "DISCARD" },
      }),
    );
    const out = await createOpenAIProvider({ transport }).adapter?.run(req, {
      signal: new AbortController().signal,
      authorization: authorizeDispatch(prepareWire(req).requestHash),
    });
    expect(out?.kind).toBe("response");
    expect(JSON.stringify(out)).not.toContain("malicious-model");
    expect(JSON.stringify(out)).not.toContain("DISCARD");
  });
});
