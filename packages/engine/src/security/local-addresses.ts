import { networkInterfaces } from "node:os";
import { classifyAddress } from "./ip-policy";

/** A globally numbered interface on the scanner is still a local service destination. */
export function localPublicAddresses(): ReadonlySet<string> {
  const addresses = new Set<string>();
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      const decision = classifyAddress(entry.address);
      if (decision.ok) addresses.add(decision.address);
    }
  }
  return addresses;
}
