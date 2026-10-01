import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import type { Duplex } from "node:stream";
import { validateAnswers } from "../security/dns";
import { EgressError, redirectStatuses } from "../security/types";
import {
  hasForbiddenUrlCharacters,
  type ParsedTarget,
  validateTargetUrl,
} from "../security/url-policy";
import type {
  EgressProxy,
  ProxyClassification,
  ProxyDecision,
  ProxyDependencies,
  ProxyRequestType,
} from "./types";

export const proxyLimits = Object.freeze({
  lifetimeMs: 60_000,
  operationMs: 10_000,
  maxBodyBytes: 1024 * 1024,
  maxTransferredBytes: 16 * 1024 * 1024,
  maxRequests: 64,
  maxActiveSockets: 16,
  maxTotalSockets: 96,
  maxAuditRecords: 128,
  maxHeaderBytes: 16 * 1024,
  maxHeaderFields: 100,
});
const limits = proxyLimits;

const hopByHop = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "set-cookie",
  "set-cookie2",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function responseHeader(
  headers: Readonly<Record<string, string>>,
  wanted: string,
): string | undefined {
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === wanted) return value;
  }
  return undefined;
}

function sanitizeResponseHeaders(
  headers: Readonly<Record<string, string>>,
): Record<string, string> {
  if (Object.keys(headers).length > limits.maxHeaderFields) {
    throw new EgressError("INVALID_RESPONSE", "response");
  }
  const connectionTokens = new Set(
    (responseHeader(headers, "connection") ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  const sanitized: Record<string, string> = {};
  let bytes = 0;
  for (const [rawName, value] of Object.entries(headers)) {
    const name = rawName.toLowerCase();
    bytes += Buffer.byteLength(rawName) + Buffer.byteLength(value) + 4;
    if (bytes > limits.maxHeaderBytes) throw new EgressError("INVALID_RESPONSE", "response");
    if (hopByHop.has(name) || connectionTokens.has(name)) continue;
    try {
      http.validateHeaderName(name);
      http.validateHeaderValue(name, value);
    } catch {
      throw new EgressError("INVALID_RESPONSE", "response");
    }
    sanitized[name] = value;
  }
  return sanitized;
}

function parseConnectAuthority(authority: string): ParsedTarget | undefined {
  if (
    authority.length > 253 + 4 ||
    hasForbiddenUrlCharacters(authority) ||
    authority.includes("/") ||
    authority.includes("?") ||
    authority.includes("#") ||
    authority.includes("@") ||
    authority.includes("%")
  ) {
    return undefined;
  }
  const match = /^([a-z0-9.-]+):443$/i.exec(authority);
  if (!match?.[1]) return undefined;
  const target = validateTargetUrl(`https://${match[1]}/`);
  return target.ok && target.port === 443 ? target : undefined;
}

function failureRecord(
  requestType: ProxyRequestType,
  error: unknown,
): Omit<ProxyDecision, "decision"> {
  if (error instanceof EgressError) {
    return {
      requestType,
      reason: error.reason,
      classification:
        error.classification ??
        (error.stage === "dns"
          ? "dns-policy"
          : error.stage === "redirect"
            ? "redirect-policy"
            : "transport"),
    };
  }
  return { requestType, reason: "REQUEST_FAILED", classification: "transport" };
}

async function resolveTarget(
  target: ParsedTarget,
  signal: AbortSignal,
  dependencies: ProxyDependencies,
) {
  let answers: Awaited<ReturnType<ProxyDependencies["resolve"]>>;
  try {
    answers = await dependencies.resolve(target.hostname, signal);
  } catch (error) {
    if (error instanceof EgressError) throw error;
    throw new EgressError("DNS_RESOLUTION_FAILED", "dns");
  }
  signal.throwIfAborted();
  const pins = validateAnswers(answers);
  const pin = pins[0];
  if (!pin) throw new EgressError("DNS_RESOLUTION_FAILED", "dns");
  return pin;
}

async function validateRedirect(
  current: ParsedTarget,
  statusCode: number,
  headers: Readonly<Record<string, string>>,
  signal: AbortSignal,
  dependencies: ProxyDependencies,
): Promise<void> {
  if (!redirectStatuses.has(statusCode)) return;
  const location = responseHeader(headers, "location");
  if (!location || location.length > 2048 || hasForbiddenUrlCharacters(location)) {
    throw new EgressError("INVALID_REDIRECT", "redirect");
  }
  let nextUrl: string;
  try {
    nextUrl = /^[a-z][a-z\d+.-]*:/i.test(location)
      ? location
      : location.startsWith("//")
        ? `${current.protocol}${location}`
        : new URL(location, current.url).href;
  } catch {
    throw new EgressError("INVALID_REDIRECT", "redirect");
  }
  const next = validateTargetUrl(nextUrl);
  if (!next.ok) throw new EgressError("UNSAFE_REDIRECT", "redirect");
  if (current.protocol === "https:" && next.protocol !== "https:") {
    throw new EgressError("HTTPS_DOWNGRADE", "redirect");
  }
  try {
    await resolveTarget(next, signal, dependencies);
  } catch (error) {
    if (error instanceof EgressError && error.stage === "dns") {
      throw new EgressError("UNSAFE_REDIRECT", "redirect", error.classification);
    }
    throw error;
  }
}

/** Internal test seam. Production callers can only use startEgressProxy(). */
export async function startProxy(dependencies: ProxyDependencies): Promise<EgressProxy> {
  const decisions: ProxyDecision[] = [];
  const sockets = new Set<Socket>();
  const lifetime = new AbortController();
  let requestCount = 0;
  let totalSocketCount = 0;
  let transferredBytes = 0;
  let closing: Promise<void> | undefined;

  const record = (decision: ProxyDecision) => {
    if (decisions.length === limits.maxAuditRecords) decisions.shift();
    decisions.push(Object.freeze(decision));
  };
  const deny = (
    requestType: ProxyRequestType,
    reason: string,
    classification: ProxyClassification,
  ) => record({ decision: "blocked", requestType, reason, classification });
  const admitRequest = (requestType: ProxyRequestType): boolean => {
    requestCount++;
    if (requestCount <= limits.maxRequests && !lifetime.signal.aborted) return true;
    deny(
      requestType,
      lifetime.signal.aborted ? "LIFETIME_LIMIT" : "REQUEST_LIMIT",
      "resource-limit",
    );
    return false;
  };
  const operationSignal = (client: Duplex) => {
    const operation = new AbortController();
    const timer = setTimeout(
      () => operation.abort(new EgressError("REQUEST_TIMEOUT", "connection")),
      limits.operationMs,
    );
    const clientClosed = () => operation.abort(new EgressError("ABORTED", "connection"));
    client.once("close", clientClosed);
    const signal = AbortSignal.any([lifetime.signal, operation.signal]);
    return {
      signal,
      cleanup: () => {
        clearTimeout(timer);
        client.off("close", clientClosed);
      },
    };
  };
  const reserveBytes = (count: number): boolean => {
    if (
      !Number.isSafeInteger(count) ||
      count < 0 ||
      transferredBytes + count > limits.maxTransferredBytes
    )
      return false;
    transferredBytes += count;
    return true;
  };

  const server = http.createServer(
    {
      maxHeaderSize: limits.maxHeaderBytes,
      insecureHTTPParser: false,
      connectionsCheckingInterval: 1_000,
    },
    async (request: IncomingMessage, response: ServerResponse) => {
      const requestType = "http" as const;
      if (!admitRequest(requestType)) {
        response.writeHead(429, { Connection: "close", "Content-Type": "text/plain" });
        response.end("Proxy limit exceeded.");
        return;
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        deny(requestType, "METHOD_NOT_ALLOWED", "request-policy");
        response.writeHead(405, { Connection: "close", Allow: "GET, HEAD" });
        response.end();
        return;
      }
      if (
        request.headers["content-length"] !== undefined ||
        request.headers["transfer-encoding"] !== undefined
      ) {
        deny(requestType, "REQUEST_BODY_NOT_ALLOWED", "request-policy");
        response.writeHead(400, { Connection: "close" });
        response.end();
        return;
      }
      const rawTarget = request.url ?? "";
      if (!/^https?:\/\//i.test(rawTarget)) {
        deny(requestType, "ABSOLUTE_FORM_REQUIRED", "request-policy");
        response.writeHead(400, { Connection: "close" });
        response.end();
        return;
      }
      const target = validateTargetUrl(rawTarget);
      if (!target.ok) {
        deny(requestType, target.reason, "target-policy");
        response.writeHead(403, { Connection: "close" });
        response.end();
        return;
      }
      const operation = operationSignal(request.socket);
      try {
        const pin = await resolveTarget(target, operation.signal, dependencies);
        const upstream = await dependencies.request(target, pin, {
          method: request.method,
          signal: operation.signal,
          maxBodyBytes: limits.maxBodyBytes,
        });
        operation.signal.throwIfAborted();
        if (
          !Number.isSafeInteger(upstream.statusCode) ||
          upstream.statusCode < 200 ||
          upstream.statusCode > 599 ||
          upstream.statusCode === 101 ||
          !(upstream.body instanceof Uint8Array) ||
          upstream.body.byteLength > limits.maxBodyBytes
        ) {
          throw new EgressError(
            upstream.body instanceof Uint8Array && upstream.body.byteLength > limits.maxBodyBytes
              ? "RESPONSE_TOO_LARGE"
              : "INVALID_RESPONSE",
            "response",
          );
        }
        await validateRedirect(
          target,
          upstream.statusCode,
          upstream.headers,
          operation.signal,
          dependencies,
        );
        const headers = sanitizeResponseHeaders(upstream.headers);
        const redirect = redirectStatuses.has(upstream.statusCode);
        const outboundBody = redirect ? new Uint8Array() : upstream.body;
        if (redirect) {
          delete headers["content-length"];
          delete headers["content-encoding"];
        }
        if (!reserveBytes(outboundBody.byteLength)) {
          deny(requestType, "BYTE_LIMIT", "resource-limit");
          response.writeHead(429, { Connection: "close" });
          response.end();
          return;
        }
        record({ decision: "allowed", requestType, reason: "ALLOWED", classification: "public" });
        response.writeHead(upstream.statusCode, headers);
        response.end(request.method === "HEAD" ? undefined : outboundBody);
      } catch (error) {
        record({
          decision: "blocked",
          ...failureRecord(requestType, operation.signal.aborted ? operation.signal.reason : error),
        });
        if (!response.headersSent) response.writeHead(502, { Connection: "close" });
        response.end();
      } finally {
        operation.cleanup();
      }
    },
  );
  server.headersTimeout = 5_000;
  server.requestTimeout = limits.operationMs;
  server.keepAliveTimeout = 1_000;
  server.maxRequestsPerSocket = 8;
  server.setTimeout(limits.operationMs + 1_000, (socket) => socket.destroy());

  server.on("connection", (socket) => {
    totalSocketCount++;
    if (
      sockets.size >= limits.maxActiveSockets ||
      totalSocketCount > limits.maxTotalSockets ||
      lifetime.signal.aborted
    ) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    socket.setNoDelay(true);
    socket.once("close", () => sockets.delete(socket));
  });

  server.on("upgrade", (_request, socket) => {
    if (admitRequest("upgrade")) deny("upgrade", "UPGRADE_NOT_ALLOWED", "request-policy");
    socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
  });

  server.on("connect", async (request, client, head) => {
    const requestType = "connect" as const;
    if (!admitRequest(requestType)) {
      client.end("HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n");
      return;
    }
    if (request.method !== "CONNECT") {
      deny(requestType, "METHOD_NOT_ALLOWED", "request-policy");
      client.end("HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\n\r\n");
      return;
    }
    if (
      request.headers["content-length"] !== undefined ||
      request.headers["transfer-encoding"] !== undefined
    ) {
      deny(requestType, "REQUEST_BODY_NOT_ALLOWED", "request-policy");
      client.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
      return;
    }
    const target = parseConnectAuthority(request.url ?? "");
    if (!target) {
      deny(requestType, "INVALID_CONNECT_AUTHORITY", "target-policy");
      client.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    const operation = operationSignal(client);
    let upstream: Socket | undefined;
    let tunneled = false;
    try {
      const pin = await resolveTarget(target, operation.signal, dependencies);
      upstream = await dependencies.connect(target, pin, operation.signal);
      operation.signal.throwIfAborted();
      if (!reserveBytes(head.byteLength)) throw new EgressError("RESPONSE_TOO_LARGE", "response");
      record({ decision: "allowed", requestType, reason: "ALLOWED", classification: "public" });
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.byteLength) upstream.write(head);
      let budgetDenied = false;
      const count = (chunk: Buffer) => {
        if (budgetDenied || reserveBytes(chunk.byteLength)) return;
        budgetDenied = true;
        deny(requestType, "BYTE_LIMIT", "resource-limit");
        client.destroy();
        upstream?.destroy();
      };
      client.on("data", count);
      upstream.on("data", count);
      const abortTunnel = () => {
        client.destroy();
        upstream?.destroy();
      };
      const cleanupTunnel = () => {
        operation.signal.removeEventListener("abort", abortTunnel);
        operation.cleanup();
      };
      operation.signal.addEventListener("abort", abortTunnel, { once: true });
      client.once("error", () => upstream?.destroy());
      upstream.once("error", () => client.destroy());
      client.once("close", () => {
        upstream?.destroy();
        cleanupTunnel();
      });
      upstream.once("close", () => {
        client.destroy();
        cleanupTunnel();
      });
      client.pipe(upstream);
      upstream.pipe(client);
      tunneled = true;
    } catch (error) {
      upstream?.destroy();
      record({
        decision: "blocked",
        ...failureRecord(requestType, operation.signal.aborted ? operation.signal.reason : error),
      });
      if (!client.destroyed) client.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
    } finally {
      if (!tunneled) operation.cleanup();
    }
  });

  server.on("clientError", (_error, socket) => socket.destroy());

  const close = (): Promise<void> => {
    if (closing) return closing;
    clearTimeout(lifetimeTimer);
    lifetime.abort(new EgressError("ABORTED", "connection"));
    for (const socket of sockets) socket.destroy();
    closing = new Promise((resolve) => {
      if (!server.listening) resolve();
      else server.close(() => resolve());
    });
    return closing;
  };
  const lifetimeTimer = setTimeout(() => void close(), limits.lifetimeMs);
  lifetimeTimer.unref();
  server.once("close", () => clearTimeout(lifetimeTimer));

  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(0, "127.0.0.1");
    });
  } catch (error) {
    await close();
    throw error;
  }
  server.on("error", () => void close());
  const address = server.address();
  if (!address || typeof address === "string") {
    await close();
    throw new Error("Proxy failed to bind to loopback.");
  }
  return Object.freeze({
    url: `http://127.0.0.1:${address.port}`,
    get decisions() {
      return Object.freeze([...decisions]);
    },
    close,
  });
}
