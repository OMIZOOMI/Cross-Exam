import { execFileSync } from "node:child_process";
import dgram from "node:dgram";
import net from "node:net";

/** Owned Linux CI fixtures only. No host LAN or Internet target is contacted. */
export async function startSentinels() {
  const device = "ce-fixture0";
  const addresses = [
    "127.0.0.1",
    "::1",
    "10.203.0.1",
    "198.18.0.1",
    "169.254.169.254",
    "fd00:ce::1",
    "fe80::1",
  ];
  const tcp: net.Server[] = [];
  const udp: dgram.Socket[] = [];
  let tcpHits = 0;
  let udpHits = 0;
  let armed = false;
  // Fail on name collision; never modify an existing host interface.
  execFileSync("/usr/sbin/ip", ["link", "add", device, "type", "dummy"]);
  const close = async () => {
    await Promise.all(
      tcp.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
    for (const socket of udp) socket.close();
    execFileSync("/usr/sbin/ip", ["link", "delete", device]);
  };
  try {
    for (const address of addresses.slice(2)) {
      execFileSync("/usr/sbin/ip", [
        "address",
        "add",
        `${address}/${net.isIP(address) === 6 ? 128 : 32}`,
        "dev",
        device,
        ...(net.isIP(address) === 6 ? ["nodad"] : []),
      ]);
    }
    execFileSync("/usr/sbin/ip", ["link", "set", device, "up"]);
    for (const address of addresses) {
      const host = address.startsWith("fe80:") ? `${address}%${device}` : address;
      for (const port of [41231, 53]) {
        const server = net.createServer((socket) => {
          if (armed) tcpHits++;
          socket.end();
        });
        await new Promise<void>((resolve, reject) => {
          server.once("error", reject);
          server.listen({ host, port, ipv6Only: true }, resolve);
        });
        tcp.push(server);
        // Positive control proves each endpoint actually exists before zero-hit assertions.
        await new Promise<void>((resolve, reject) => {
          const socket = net.connect({ host, port });
          socket.once("error", reject);
          socket.once("connect", () => {
            socket.destroy();
            resolve();
          });
        });
      }
      for (const port of [41232, 53]) {
        const socket = dgram.createSocket(net.isIP(address) === 6 ? "udp6" : "udp4");
        socket.on("message", () => {
          if (armed) udpHits++;
        });
        await new Promise<void>((resolve, reject) => {
          socket.once("error", reject);
          socket.bind(port, host, resolve);
        });
        udp.push(socket);
        await new Promise<void>((resolve, reject) => {
          const client = dgram.createSocket(net.isIP(address) === 6 ? "udp6" : "udp4");
          const timer = setTimeout(() => {
            client.close();
            reject(new Error("UDP sentinel positive control failed"));
          }, 2000);
          socket.once("message", () => {
            clearTimeout(timer);
            client.close();
            resolve();
          });
          client.send(Buffer.from("owned-positive-control"), port, host);
        });
      }
    }
    armed = true;
    return { close, counts: () => ({ tcpHits, udpHits, ownedAddresses: addresses.length }) };
  } catch (error) {
    await close();
    throw error;
  }
}
