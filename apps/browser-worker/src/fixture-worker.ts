import {
  type Browser,
  type BrowserContext,
  chromium,
  type LaunchOptions,
  type Page,
  type Request,
} from "@playwright/test";

const DEFAULT_TIMEOUT_MS = 10_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_REQUESTS = 64;
const MAX_DECISIONS = 96;
const CLEANUP_RESERVE_MAX_MS = 1_000;

const ALLOWED_METHODS = new Set(["GET", "HEAD"]);
const ALLOWED_RESOURCE_TYPES = new Set([
  "document",
  "fetch",
  "font",
  "image",
  "script",
  "stylesheet",
  "xhr",
]);
const KNOWN_REQUEST_TYPES = new Set([
  ...ALLOWED_RESOURCE_TYPES,
  "download",
  "eventsource",
  "manifest",
  "media",
  "other",
  "popup",
  "texttrack",
  "websocket",
  "worker",
]);

const FIXED_CHROMIUM_ARGS = Object.freeze([
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-default-apps",
  "--disable-domain-reliability",
  "--disable-quic",
  "--disable-sync",
  "--deny-permission-prompts",
  "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
  "--no-first-run",
  // Bounded Linux sandbox activation diagnostics; no sandbox policy changes.
  "--enable-logging=stderr",
  "--vmodule=sandbox_linux=1",
]);

export type FixtureDecisionReason =
  | "REQUEST_ALLOWED"
  | "UNSAFE_METHOD"
  | "UNSUPPORTED_SCHEME"
  | "UNSUPPORTED_RESOURCE_TYPE"
  | "REQUEST_LIMIT"
  | "DEADLINE_EXCEEDED"
  | "WEBSOCKET_DENIED"
  | "POPUP_LIMIT"
  | "DOWNLOAD_DENIED";

export type FixtureDecision = Readonly<{
  sequence: number;
  action: "allow" | "deny";
  reason: FixtureDecisionReason;
  requestType: string;
}>;

export type FixtureWorker = {
  readonly browser: Browser;
  readonly context: BrowserContext;
  readonly page: Page;
  readonly decisions: readonly FixtureDecision[];
  close(): Promise<void>;
};

export type LaunchFixtureWorkerOptions = Readonly<{
  proxyServer: string;
  timeoutMs?: number;
}>;

export class FixtureWorkerConfigurationError extends Error {
  readonly code = "INVALID_FIXTURE_WORKER_CONFIGURATION";

  constructor(message: string) {
    super(message);
    this.name = "FixtureWorkerConfigurationError";
  }
}

export class FixtureWorkerTimeoutError extends Error {
  readonly code = "FIXTURE_WORKER_TIMEOUT";

  constructor() {
    super("The fixture browser worker exceeded its whole-job deadline.");
    this.name = "FixtureWorkerTimeoutError";
  }
}

type ValidatedProxy = {
  server: string;
  host: "127.0.0.1" | "::1";
};

function validateProxyServer(input: unknown): ValidatedProxy {
  if (typeof input !== "string") {
    throw new FixtureWorkerConfigurationError("proxyServer must be a loopback HTTP URL.");
  }

  const match =
    /^(?:http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})|http:\/\/\[::1\]:([1-9][0-9]{0,4}))$/.exec(input);
  if (!match) {
    throw new FixtureWorkerConfigurationError(
      "proxyServer must exactly match http://127.0.0.1:<port> or http://[::1]:<port>.",
    );
  }

  const portText = match[1] ?? match[2];
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535 || String(port) !== portText) {
    throw new FixtureWorkerConfigurationError(
      "proxyServer must contain a canonical port from 1 to 65535.",
    );
  }

  return {
    server: input,
    host: match[1] === undefined ? "::1" : "127.0.0.1",
  };
}

function validateTimeout(input: unknown): number {
  if (input === undefined) return DEFAULT_TIMEOUT_MS;
  if (
    typeof input !== "number" ||
    !Number.isSafeInteger(input) ||
    input < MIN_TIMEOUT_MS ||
    input > MAX_TIMEOUT_MS
  ) {
    throw new FixtureWorkerConfigurationError(
      `timeoutMs must be an integer from ${MIN_TIMEOUT_MS} to ${MAX_TIMEOUT_MS}.`,
    );
  }
  return input;
}

function hostResolverRule(proxyHost: ValidatedProxy["host"]): string {
  const excludedHost = proxyHost === "::1" ? "[::1]" : proxyHost;
  return `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${excludedHost}`;
}

function launchOptions(proxy: ValidatedProxy, timeoutMs: number): LaunchOptions {
  return {
    args: [...FIXED_CHROMIUM_ARGS, hostResolverRule(proxy.host)],
    chromiumSandbox: true,
    env: {
      LANG: "en_US.UTF-8",
      TZ: "UTC",
    },
    headless: true,
    proxy: {
      server: proxy.server,
      bypass: "<-loopback>",
    },
    timeout: timeoutMs,
  };
}

function requestPolicy(request: Request): {
  action: "allow" | "deny";
  reason: FixtureDecisionReason;
  requestType: string;
} {
  const requestType = request.resourceType();
  const method = request.method().toUpperCase();
  let protocol: string;
  try {
    protocol = new URL(request.url()).protocol;
  } catch {
    return { action: "deny", reason: "UNSUPPORTED_SCHEME", requestType };
  }

  if (protocol !== "http:" && protocol !== "https:") {
    return { action: "deny", reason: "UNSUPPORTED_SCHEME", requestType };
  }
  if (!ALLOWED_METHODS.has(method)) {
    return { action: "deny", reason: "UNSAFE_METHOD", requestType };
  }
  if (!ALLOWED_RESOURCE_TYPES.has(requestType)) {
    return { action: "deny", reason: "UNSUPPORTED_RESOURCE_TYPE", requestType };
  }
  return { action: "allow", reason: "REQUEST_ALLOWED", requestType };
}

function waitAtMost<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  if (milliseconds <= 0) return Promise.reject(new FixtureWorkerTimeoutError());
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new FixtureWorkerTimeoutError()), milliseconds);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Test-only Chromium harness. Import this file directly; it is intentionally not
 * exported by the package. Destination authorization belongs to the supplied
 * enforcing proxy, not to Playwright routing.
 */
export async function launchFixtureWorker(
  options: LaunchFixtureWorkerOptions,
): Promise<FixtureWorker> {
  const proxy = validateProxyServer(options?.proxyServer);
  const timeoutMs = validateTimeout(options?.timeoutMs);
  const startedAt = Date.now();
  const deadlineAt = startedAt + timeoutMs;
  const cleanupReserveMs = Math.min(CLEANUP_RESERVE_MAX_MS, Math.floor(timeoutMs / 4));
  const operationalDeadlineAt = deadlineAt - cleanupReserveMs;
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let closePromise: Promise<void> | undefined;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let requestCount = 0;
  let pageCount = 0;
  const audit: FixtureDecision[] = [];

  const record = (
    action: FixtureDecision["action"],
    reason: FixtureDecisionReason,
    requestType: string,
  ): void => {
    if (audit.length >= MAX_DECISIONS) return;
    const safeRequestType = KNOWN_REQUEST_TYPES.has(requestType) ? requestType : "unknown";
    audit.push(
      Object.freeze({
        sequence: audit.length + 1,
        action,
        reason,
        requestType: safeRequestType,
      }),
    );
  };

  const closeInternal = (): Promise<void> => {
    if (closePromise) return closePromise;
    if (deadlineTimer) clearTimeout(deadlineTimer);

    closePromise = (async () => {
      const remaining = Math.max(0, deadlineAt - Date.now());
      const closeOperations = (async () => {
        const operations: Promise<unknown>[] = [];
        if (context) operations.push(context.close().catch(() => undefined));
        if (browser) operations.push(browser.close().catch(() => undefined));
        await Promise.all(operations);
      })();
      let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          closeOperations,
          new Promise<void>((resolve) => {
            cleanupTimer = setTimeout(resolve, remaining);
          }),
        ]);
      } finally {
        if (cleanupTimer) clearTimeout(cleanupTimer);
      }
    })();
    return closePromise;
  };

  const remainingOperationalTime = (): number => operationalDeadlineAt - Date.now();

  try {
    const pendingBrowser = chromium.launch(launchOptions(proxy, timeoutMs));
    pendingBrowser.then(
      (launchedBrowser) => {
        if (Date.now() >= operationalDeadlineAt && launchedBrowser !== browser) {
          void launchedBrowser.close().catch(() => undefined);
        }
      },
      () => undefined,
    );
    browser = await waitAtMost(pendingBrowser, remainingOperationalTime());

    context = await waitAtMost(
      browser.newContext({
        acceptDownloads: false,
        bypassCSP: false,
        ignoreHTTPSErrors: false,
        javaScriptEnabled: true,
        permissions: [],
        serviceWorkers: "block",
        storageState: { cookies: [], origins: [] },
      }),
      remainingOperationalTime(),
    );

    await waitAtMost(context.clearPermissions(), remainingOperationalTime());

    await waitAtMost(
      context.routeWebSocket(/.*/, async (webSocket) => {
        record("deny", "WEBSOCKET_DENIED", "websocket");
        await webSocket.close({ code: 1008, reason: "WebSocket access is disabled" });
      }),
      remainingOperationalTime(),
    );

    await waitAtMost(
      context.route("**/*", async (route) => {
        requestCount += 1;

        if (Date.now() >= operationalDeadlineAt) {
          record("deny", "DEADLINE_EXCEEDED", route.request().resourceType());
          const abort = route.abort("timedout").catch(() => undefined);
          void closeInternal();
          await abort;
          return;
        }

        if (requestCount > MAX_REQUESTS) {
          record("deny", "REQUEST_LIMIT", route.request().resourceType());
          const abort = route.abort("blockedbyclient").catch(() => undefined);
          void closeInternal();
          await abort;
          return;
        }

        const decision = requestPolicy(route.request());
        record(decision.action, decision.reason, decision.requestType);
        if (decision.action === "deny") {
          await route.abort("blockedbyclient");
          return;
        }

        await route.continue();
      }),
      remainingOperationalTime(),
    );

    context.on("page", (newPage) => {
      pageCount += 1;
      newPage.on("download", (download) => {
        record("deny", "DOWNLOAD_DENIED", "download");
        void download.cancel();
      });
      if (pageCount > 1) {
        record("deny", "POPUP_LIMIT", "popup");
        void newPage.close();
      }
    });

    const page = await waitAtMost(context.newPage(), remainingOperationalTime());
    page.setDefaultNavigationTimeout(Math.max(1, remainingOperationalTime()));
    page.setDefaultTimeout(Math.max(1, remainingOperationalTime()));

    deadlineTimer = setTimeout(
      () => {
        record("deny", "DEADLINE_EXCEEDED", "worker");
        void closeInternal();
      },
      Math.max(0, remainingOperationalTime()),
    );

    return {
      browser,
      context,
      page,
      get decisions() {
        return audit.slice();
      },
      close: closeInternal,
    };
  } catch (error) {
    await closeInternal();
    throw error;
  }
}
