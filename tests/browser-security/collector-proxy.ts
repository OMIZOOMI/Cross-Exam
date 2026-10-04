import { startProxy } from "../../packages/engine/src/browser-egress/core";
import { EgressError } from "../../packages/engine/src/security/types";
import { collectorFixtureDelay, collectorFixtureResponse } from "./collector-fixtures";

/** Closed owned transport behind the real enforcing proxy; no external socket/DNS traffic. */
export function startOwnedCollectorProxy(paths: string[]) {
  return startProxy({
    resolve: async (host) => {
      if (host === "private.crossexam-fixture.com") return [{ address: "10.0.0.1", family: 4 }];
      if (host === "mixed.crossexam-fixture.com")
        return [
          { address: "93.184.216.34", family: 4 },
          { address: "::1", family: 6 },
        ];
      if (host === "entry.crossexam-fixture.com") return [{ address: "93.184.216.34", family: 4 }];
      throw new EgressError("DNS_RESOLUTION_FAILED", "dns");
    },
    request: async (target, pin) => {
      if (pin.address !== "93.184.216.34" || target.hostname !== "entry.crossexam-fixture.com")
        throw new Error("Outside owned fixture transport");
      const path = new URL(target.url).pathname;
      paths.push(path);
      const delay = collectorFixtureDelay(path);
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      const response = collectorFixtureResponse(path);
      if (!response) throw new Error("Unknown fixture");
      return response;
    },
    connect: async () => {
      throw new EgressError("REQUEST_FAILED", "connection");
    },
  });
}
