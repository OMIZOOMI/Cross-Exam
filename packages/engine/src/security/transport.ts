import http from "node:http";
import https from "node:https";
import net, { type Socket } from "node:net";
import tls from "node:tls";
import { classifyAddress } from "./ip-policy";
import { localPublicAddresses } from "./local-addresses";
import { EgressError, type PinnedTransport, redirectStatuses } from "./types";
import { validateTargetUrl } from "./url-policy";

/** Internal only: receives a fresh validated pin, never a caller-supplied dispatcher/agent. */
export const requestPinned: PinnedTransport = async (target, pin, options) => {
  const parsed = validateTargetUrl(target.url);
  const address = classifyAddress(pin.address);
  if (
    !parsed.ok ||
    !address.ok ||
    address.family !== pin.family ||
    localPublicAddresses().has(address.address) ||
    parsed.hostname !== target.hostname ||
    parsed.port !== target.port ||
    parsed.protocol !== target.protocol
  ) {
    throw new EgressError("PEER_MISMATCH", "connection");
  }
  options.signal.throwIfAborted();
  const secure = parsed.protocol === "https:";
  const agentOptions = {
    keepAlive: false,
    maxSockets: 1,
    maxTotalSockets: 1,
    proxyEnv: { NODE_ENV: "production" as const },
  };
  const agent = secure ? new https.Agent(agentOptions) : new http.Agent(agentOptions);
  let pendingSocket: Socket | undefined;
  // Only this closure chooses the network destination. No lookup, proxy, family fallback or pool.
  agent.createConnection = (_ignored, callback) => {
    const connectOptions = {
      host: address.address,
      port: parsed.port,
      family: address.family,
      autoSelectFamily: false,
      signal: options.signal,
    };
    const socket = secure
      ? tls.connect({
          ...connectOptions,
          servername: parsed.hostname,
          rejectUnauthorized: true,
          minVersion: "TLSv1.2",
          ALPNProtocols: ["http/1.1"],
          checkServerIdentity: (_hostname, certificate) =>
            tls.checkServerIdentity(parsed.hostname, certificate),
        })
      : net.createConnection(connectOptions);
    pendingSocket = socket;
    let delivered = false;
    const fail = (error: Error) => {
      if (delivered) return;
      delivered = true;
      socket.destroy();
      callback?.(error, socket);
    };
    socket.once("error", fail);
    socket.once(secure ? "secureConnect" : "connect", () => {
      const peer = classifyAddress(socket.remoteAddress ?? "");
      if (options.signal.aborted) return fail(new EgressError("ABORTED", "connection"));
      if (
        !peer.ok ||
        peer.address !== address.address ||
        socket.remotePort !== parsed.port ||
        (secure && !(socket as tls.TLSSocket).authorized)
      ) {
        return fail(new EgressError("PEER_MISMATCH", "connection"));
      }
      delivered = true;
      // HTTP receives the socket only after peer and (for HTTPS) certificate checks pass.
      callback?.(null, socket);
    });
    return undefined;
  };
  try {
    return await new Promise((resolve, reject) => {
      const url = new URL(parsed.url);
      const request = (secure ? https : http).request(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port,
          path: `${url.pathname}${url.search}`,
          method: options.method,
          agent,
          signal: options.signal,
          maxHeaderSize: 16 * 1024,
          insecureHTTPParser: false,
          headers: {
            Host: url.host,
            Accept: "*/*",
            "Accept-Encoding": "identity",
            "User-Agent": "CrossExam/0.1",
            Connection: "close",
          },
        },
        (response) => {
          const statusCode = response.statusCode ?? 0;
          const headers: Record<string, string> = {};
          for (const [name, value] of Object.entries(response.headers)) {
            if (value !== undefined)
              headers[name] = Array.isArray(value) ? value.join(", ") : value;
          }
          const locationCount = response.rawHeaders.filter(
            (_, index) =>
              index % 2 === 0 && response.rawHeaders[index]?.toLowerCase() === "location",
          ).length;
          response.on("error", reject);
          response.on("aborted", () => reject(new EgressError("REQUEST_FAILED", "response")));
          if (
            statusCode < 200 ||
            statusCode > 599 ||
            response.rawHeaders.length > 200 ||
            locationCount > 1
          ) {
            reject(new EgressError("INVALID_RESPONSE", "response"));
            response.destroy();
            return;
          }
          if (redirectStatuses.has(statusCode)) {
            // Discard redirect bodies immediately. They cannot spend the body budget or hold the hop open.
            resolve({ statusCode, headers, body: new Uint8Array() });
            response.destroy();
            return;
          }
          const length = headers["content-length"];
          if (options.method !== "HEAD" && length && Number(length) > options.maxBodyBytes) {
            reject(new EgressError("RESPONSE_TOO_LARGE", "response"));
            response.destroy();
            return;
          }
          if (
            headers["content-encoding"] &&
            headers["content-encoding"].toLowerCase() !== "identity"
          ) {
            reject(new EgressError("INVALID_RESPONSE", "response"));
            response.destroy();
            return;
          }
          const chunks: Buffer[] = [];
          let bytes = 0;
          response.on("data", (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > options.maxBodyBytes) {
              reject(new EgressError("RESPONSE_TOO_LARGE", "response"));
              response.destroy();
              return;
            }
            chunks.push(chunk);
          });
          response.once("end", () => {
            if (!response.complete) reject(new EgressError("INVALID_RESPONSE", "response"));
            else resolve({ statusCode, headers, body: Buffer.concat(chunks, bytes) });
          });
        },
      );
      request.once("error", reject);
      request.once("upgrade", (_response, socket) => {
        socket.destroy();
        reject(new EgressError("INVALID_RESPONSE", "response"));
      });
      request.end();
    });
  } finally {
    pendingSocket?.destroy();
    agent.destroy();
  }
};
