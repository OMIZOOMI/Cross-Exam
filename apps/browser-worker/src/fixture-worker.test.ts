import type {
  Browser,
  BrowserContext,
  Download,
  Page,
  Route,
  WebSocketRoute,
} from "@playwright/test";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  launch: vi.fn(),
}));

vi.mock("@playwright/test", () => ({
  chromium: {
    launch: mocks.launch,
  },
}));

import { FixtureWorkerConfigurationError, launchFixtureWorker } from "./fixture-worker";

type RouteHandler = (route: Route) => Promise<void>;
type WebSocketHandler = (route: WebSocketRoute) => Promise<void>;
type PageHandler = (page: Page) => void;
type DownloadHandler = (download: Download) => void;

function fakePage() {
  const downloadHandlers: DownloadHandler[] = [];
  return {
    downloadHandlers,
    value: {
      close: vi.fn(async () => undefined),
      on: vi.fn((event: string, handler: DownloadHandler) => {
        if (event === "download") downloadHandlers.push(handler);
      }),
      setDefaultNavigationTimeout: vi.fn(),
      setDefaultTimeout: vi.fn(),
    } as unknown as Page,
  };
}

function browserHarness() {
  const order: string[] = [];
  const routeHandlers: RouteHandler[] = [];
  const webSocketHandlers: WebSocketHandler[] = [];
  const pageHandlers: PageHandler[] = [];
  const primaryPage = fakePage();
  const context = {
    clearPermissions: vi.fn(async () => {
      order.push("clearPermissions");
    }),
    close: vi.fn(async () => undefined),
    newPage: vi.fn(async () => {
      order.push("newPage");
      for (const handler of pageHandlers) handler(primaryPage.value);
      return primaryPage.value;
    }),
    on: vi.fn((event: string, handler: PageHandler) => {
      order.push(`on:${event}`);
      if (event === "page") pageHandlers.push(handler);
    }),
    route: vi.fn(async (_pattern: string, handler: RouteHandler) => {
      order.push("route");
      routeHandlers.push(handler);
    }),
    routeWebSocket: vi.fn(async (_pattern: RegExp, handler: WebSocketHandler) => {
      order.push("routeWebSocket");
      webSocketHandlers.push(handler);
    }),
  } as unknown as BrowserContext;
  const browser = {
    close: vi.fn(async () => undefined),
    newContext: vi.fn(async () => context),
  } as unknown as Browser;

  return {
    browser,
    context,
    order,
    pageHandlers,
    primaryPage,
    routeHandlers,
    webSocketHandlers,
  };
}

function fakeRoute(input: { method?: string; resourceType?: string; url?: string }) {
  const abort = vi.fn(async () => undefined);
  const continueRequest = vi.fn(async () => undefined);
  const fetch = vi.fn(() => {
    throw new Error("route.fetch must never be called");
  });
  const route = {
    abort,
    continue: continueRequest,
    fetch,
    request: () => ({
      method: () => input.method ?? "GET",
      resourceType: () => input.resourceType ?? "document",
      url: () => input.url ?? "http://fixture.invalid/",
    }),
  } as unknown as Route;
  return { abort, continueRequest, fetch, route };
}

beforeEach(() => {
  mocks.launch.mockReset();
});

describe("fixture browser worker configuration", () => {
  it("uses a fixed manual proxy and restrictive fresh context before creating a page", async () => {
    const harness = browserHarness();
    mocks.launch.mockResolvedValue(harness.browser);

    const worker = await launchFixtureWorker({
      proxyServer: "http://127.0.0.1:43121",
      timeoutMs: 5_000,
    });

    expect(mocks.launch).toHaveBeenCalledWith({
      args: expect.arrayContaining([
        "--disable-background-networking",
        "--disable-quic",
        "--deny-permission-prompts",
        "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
        "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
      ]),
      chromiumSandbox: true,
      env: { LANG: "en_US.UTF-8", TZ: "UTC" },
      headless: true,
      proxy: {
        server: "http://127.0.0.1:43121",
        bypass: "<-loopback>",
      },
      timeout: 5_000,
    });
    expect(harness.browser.newContext).toHaveBeenCalledWith({
      acceptDownloads: false,
      bypassCSP: false,
      ignoreHTTPSErrors: false,
      javaScriptEnabled: true,
      permissions: [],
      serviceWorkers: "block",
      storageState: { cookies: [], origins: [] },
    });
    expect(harness.order).toEqual([
      "clearPermissions",
      "routeWebSocket",
      "route",
      "on:page",
      "newPage",
    ]);

    await worker.close();
    expect(harness.context.close).toHaveBeenCalledOnce();
    expect(harness.browser.close).toHaveBeenCalledOnce();
  });

  it.each([
    "http://localhost:8080",
    "https://127.0.0.1:8080",
    "http://127.0.0.2:8080",
    "http://127.0.0.1:08080",
    "http://127.0.0.1:0",
    "http://127.0.0.1:65536",
    "http://user@127.0.0.1:8080",
    "http://127.0.0.1:8080/",
  ])("rejects a non-canonical or non-loopback proxy: %s", async (proxyServer) => {
    await expect(launchFixtureWorker({ proxyServer })).rejects.toBeInstanceOf(
      FixtureWorkerConfigurationError,
    );
    expect(mocks.launch).not.toHaveBeenCalled();
  });

  it("accepts only bounded integer deadlines", async () => {
    await expect(
      launchFixtureWorker({ proxyServer: "http://[::1]:8080", timeoutMs: 30_001 }),
    ).rejects.toMatchObject({ code: "INVALID_FIXTURE_WORKER_CONFIGURATION" });
    expect(mocks.launch).not.toHaveBeenCalled();
  });
});

describe("fixture browser worker limits", () => {
  it("lets destination policy URLs reach the proxy while denying unsafe route behavior", async () => {
    const harness = browserHarness();
    mocks.launch.mockResolvedValue(harness.browser);
    const worker = await launchFixtureWorker({
      proxyServer: "http://127.0.0.1:43121",
      timeoutMs: 5_000,
    });
    const handler = harness.routeHandlers[0];
    expect(handler).toBeDefined();

    const prohibitedDestination = fakeRoute({
      url: "http://169.254.169.254/latest/meta-data?token=secret",
    });
    await handler?.(prohibitedDestination.route);
    expect(prohibitedDestination.continueRequest).toHaveBeenCalledOnce();
    expect(prohibitedDestination.fetch).not.toHaveBeenCalled();

    const post = fakeRoute({ method: "POST", url: "http://fixture.invalid/action?secret=yes" });
    await handler?.(post.route);
    expect(post.abort).toHaveBeenCalledWith("blockedbyclient");

    const ftp = fakeRoute({ url: "ftp://fixture.invalid/file" });
    await handler?.(ftp.route);
    expect(ftp.abort).toHaveBeenCalledWith("blockedbyclient");

    const eventSource = fakeRoute({ resourceType: "eventsource" });
    await handler?.(eventSource.route);
    expect(eventSource.abort).toHaveBeenCalledWith("blockedbyclient");

    expect(worker.decisions).toEqual([
      { sequence: 1, action: "allow", reason: "REQUEST_ALLOWED", requestType: "document" },
      { sequence: 2, action: "deny", reason: "UNSAFE_METHOD", requestType: "document" },
      { sequence: 3, action: "deny", reason: "UNSUPPORTED_SCHEME", requestType: "document" },
      {
        sequence: 4,
        action: "deny",
        reason: "UNSUPPORTED_RESOURCE_TYPE",
        requestType: "eventsource",
      },
    ]);
    expect(JSON.stringify(worker.decisions)).not.toContain("secret");
    expect(JSON.stringify(worker.decisions)).not.toContain("169.254.169.254");

    await worker.close();
  });

  it("blocks WebSockets, popups, downloads, and requests beyond the fixed cap", async () => {
    const harness = browserHarness();
    mocks.launch.mockResolvedValue(harness.browser);
    const worker = await launchFixtureWorker({
      proxyServer: "http://[::1]:43121",
      timeoutMs: 5_000,
    });

    const webSocket = { close: vi.fn(async () => undefined) } as unknown as WebSocketRoute;
    await harness.webSocketHandlers[0]?.(webSocket);
    expect(webSocket.close).toHaveBeenCalledWith({
      code: 1008,
      reason: "WebSocket access is disabled",
    });

    const popup = fakePage();
    harness.pageHandlers[0]?.(popup.value);
    expect(popup.value.close).toHaveBeenCalledOnce();

    const download = { cancel: vi.fn(async () => undefined) } as unknown as Download;
    harness.primaryPage.downloadHandlers[0]?.(download);
    expect(download.cancel).toHaveBeenCalledOnce();

    const handler = harness.routeHandlers[0];
    for (let index = 0; index < 64; index += 1) {
      await handler?.(fakeRoute({ resourceType: "image" }).route);
    }
    const excessive = fakeRoute({ resourceType: "image" });
    await handler?.(excessive.route);
    expect(excessive.abort).toHaveBeenCalledWith("blockedbyclient");
    expect(worker.decisions.some((decision) => decision.reason === "REQUEST_LIMIT")).toBe(true);
    expect(worker.decisions.length).toBeLessThanOrEqual(96);

    await worker.close();
  });

  it("starts cleanup inside the whole-job deadline", async () => {
    vi.useFakeTimers();
    try {
      const harness = browserHarness();
      mocks.launch.mockResolvedValue(harness.browser);
      const worker = await launchFixtureWorker({
        proxyServer: "http://127.0.0.1:43121",
        timeoutMs: 1_000,
      });

      await vi.advanceTimersByTimeAsync(750);
      expect(harness.context.close).toHaveBeenCalledOnce();
      expect(harness.browser.close).toHaveBeenCalledOnce();
      expect(worker.decisions).toContainEqual({
        sequence: 1,
        action: "deny",
        reason: "DEADLINE_EXCEEDED",
        requestType: "worker",
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
