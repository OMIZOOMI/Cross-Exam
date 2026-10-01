import { Resolver } from "node:dns/promises";
import { classifyAddress, type PublicAddress } from "./ip-policy";
import { localPublicAddresses } from "./local-addresses";
import { type DnsAnswer, EgressError, type ResolveHost } from "./types";

export const resolveHost: ResolveHost = async (hostname, signal) => {
  signal.throwIfAborted();
  const resolver = new Resolver({ timeout: 2000, tries: 2 });
  const cancel = () => resolver.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  async function family(version: 4 | 6): Promise<DnsAnswer[]> {
    try {
      const addresses = await (version === 4
        ? resolver.resolve4(`${hostname}.`)
        : resolver.resolve6(`${hostname}.`));
      return addresses.map((address) => ({ address, family: version }));
    } catch (error) {
      // ENODATA is an absent family. NXDOMAIN, timeouts, SERVFAIL and every other error fail closed.
      if (error instanceof Error && "code" in error && error.code === "ENODATA") return [];
      throw new EgressError("DNS_RESOLUTION_FAILED", "dns");
    }
  }
  try {
    return (await Promise.all([family(4), family(6)])).flat();
  } finally {
    signal.removeEventListener("abort", cancel);
    resolver.cancel();
  }
};

export function validateAnswers(answers: readonly DnsAnswer[]): readonly PublicAddress[] {
  if (!Array.isArray(answers) || !answers.length || answers.length > 32) {
    throw new EgressError("DNS_RESOLUTION_FAILED", "dns");
  }
  const local = localPublicAddresses();
  const unique = new Map<string, PublicAddress>();
  for (const answer of answers) {
    const decision = classifyAddress(answer?.address);
    if (!decision.ok) throw new EgressError("UNSAFE_DNS_RESULT", "dns", decision.classification);
    if (decision.family !== answer.family)
      throw new EgressError("UNSAFE_DNS_RESULT", "dns", "invalid");
    if (local.has(decision.address))
      throw new EgressError("UNSAFE_DNS_RESULT", "dns", "local-interface");
    unique.set(decision.address, decision);
  }
  return [...unique.values()];
}
