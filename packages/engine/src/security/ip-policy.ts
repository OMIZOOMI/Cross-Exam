import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

export type AddressClassification =
  | "invalid"
  | "unspecified"
  | "loopback"
  | "private"
  | "link-local"
  | "shared"
  | "multicast"
  | "reserved"
  | "documentation"
  | "benchmark"
  | "ipv4-mapped"
  | "translation"
  | "cloud-platform"
  | "local-interface";
export type PublicAddress = Readonly<{
  ok: true;
  address: string;
  family: 4 | 6;
  classification: "public";
}>;
export type AddressDecision = PublicAddress | { ok: false; classification: AddressClassification };

// Conservative superset of IANA special-purpose registries, reviewed 2026-10-01.
// https://www.iana.org/assignments/iana-ipv4-special-registry/
// https://www.iana.org/assignments/iana-ipv6-special-registry/
// Deliberately do not allow globally reachable exceptions within these blocks.
const denied: [string, AddressClassification][] = [
  ["0.0.0.0/8", "unspecified"],
  ["10.0.0.0/8", "private"],
  ["100.64.0.0/10", "shared"],
  ["127.0.0.0/8", "loopback"],
  ["169.254.0.0/16", "link-local"],
  ["172.16.0.0/12", "private"],
  ["192.0.0.0/24", "reserved"],
  ["192.0.2.0/24", "documentation"],
  ["192.31.196.0/24", "reserved"],
  ["192.52.193.0/24", "reserved"],
  ["192.88.99.0/24", "translation"],
  ["192.168.0.0/16", "private"],
  ["192.175.48.0/24", "reserved"],
  ["198.18.0.0/15", "benchmark"],
  ["198.51.100.0/24", "documentation"],
  ["203.0.113.0/24", "documentation"],
  ["224.0.0.0/4", "multicast"],
  ["240.0.0.0/4", "reserved"],
  ["168.63.129.16/32", "cloud-platform"],
  ["::/128", "unspecified"],
  ["::1/128", "loopback"],
  ["::ffff:0:0/96", "ipv4-mapped"],
  ["64:ff9b::/96", "translation"],
  ["64:ff9b:1::/48", "translation"],
  ["2001:db8::/32", "documentation"],
  ["2001::/23", "reserved"],
  ["2002::/16", "translation"],
  ["2620:4f:8000::/48", "reserved"],
  ["3fff::/20", "documentation"],
  ["fc00::/7", "private"],
  ["fe80::/10", "link-local"],
  ["ff00::/8", "multicast"],
];
const ranges = denied.map(([cidr, classification]) => ({
  cidr: ipaddr.parseCIDR(cidr),
  classification,
}));
const globalV6 = ipaddr.parseCIDR("2000::/3");

export function classifyAddress(input: string): AddressDecision {
  // DNS/peer addresses must use strict literals. ipaddr alone also accepts alternate IPv4 syntax.
  const family = typeof input === "string" && !input.includes("%") ? isIP(input) : 0;
  if (family !== 4 && family !== 6) return { ok: false, classification: "invalid" };
  const address = ipaddr.parse(input);
  for (const { cidr, classification } of ranges) {
    if (address.kind() === cidr[0].kind() && address.match(cidr))
      return { ok: false, classification };
  }
  if (family === 6 && !address.match(globalV6)) return { ok: false, classification: "reserved" };
  return Object.freeze({ ok: true, address: address.toString(), family, classification: "public" });
}
