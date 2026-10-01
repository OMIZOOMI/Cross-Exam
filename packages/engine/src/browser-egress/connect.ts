import net, { type Socket } from "node:net";
import { classifyAddress, type PublicAddress } from "../security/ip-policy";
import { localPublicAddresses } from "../security/local-addresses";
import { EgressError } from "../security/types";
import { type ParsedTarget, validateTargetUrl } from "../security/url-policy";

/** Production CONNECT dialer: one validated literal, no DNS lookup or address fallback. */
export async function connectPinned(
  target: ParsedTarget,
  pin: PublicAddress,
  signal: AbortSignal,
): Promise<Socket> {
  const parsed = validateTargetUrl(target.url);
  const address = classifyAddress(pin.address);
  if (
    !parsed.ok ||
    parsed.protocol !== "https:" ||
    parsed.port !== 443 ||
    parsed.hostname !== target.hostname ||
    parsed.protocol !== target.protocol ||
    parsed.port !== target.port ||
    !address.ok ||
    address.family !== pin.family ||
    localPublicAddresses().has(address.address)
  ) {
    throw new EgressError("PEER_MISMATCH", "connection");
  }
  signal.throwIfAborted();

  return await new Promise<Socket>((resolve, reject) => {
    const socket = net.createConnection({
      host: address.address,
      port: 443,
      family: address.family,
      autoSelectFamily: false,
      signal,
    });
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      socket.off("connect", onConnect);
      socket.off("error", onError);
      if (error) {
        socket.destroy();
        reject(error);
      } else {
        resolve(socket);
      }
    };
    const onError = () =>
      finish(new EgressError(signal.aborted ? "ABORTED" : "REQUEST_FAILED", "connection"));
    const onConnect = () => {
      const peer = classifyAddress(socket.remoteAddress ?? "");
      if (
        signal.aborted ||
        !peer.ok ||
        peer.address !== address.address ||
        socket.remotePort !== 443 ||
        localPublicAddresses().has(peer.address)
      ) {
        finish(new EgressError(signal.aborted ? "ABORTED" : "PEER_MISMATCH", "connection"));
        return;
      }
      finish();
    };
    socket.once("connect", onConnect);
    socket.once("error", onError);
  });
}
