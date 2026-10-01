import { describe, expect, it } from "vitest";
import {
  BrowserIsolationUnavailableError,
  browserIsolationStatus,
  ISOLATION_UNAVAILABLE,
  launchBrowserWorker,
} from "./index";

describe("public browser worker isolation gate", () => {
  it("always rejects arbitrary launches with the stable isolation code", async () => {
    await expect(launchBrowserWorker()).rejects.toMatchObject({
      name: "BrowserIsolationUnavailableError",
      code: ISOLATION_UNAVAILABLE,
    });
    await expect(launchBrowserWorker()).rejects.toBeInstanceOf(BrowserIsolationUnavailableError);
  });

  it("reports concrete unavailable capabilities without an enable switch", () => {
    expect(browserIsolationStatus).toMatchObject({
      code: ISOLATION_UNAVAILABLE,
      status: "unavailable",
      liveLaunchesAllowed: false,
    });
    expect(browserIsolationStatus.capabilities).toHaveLength(6);
    expect(browserIsolationStatus.capabilities.every((item) => item.status === "unavailable")).toBe(
      true,
    );
    expect(Object.isFrozen(browserIsolationStatus)).toBe(true);
    expect(Object.isFrozen(browserIsolationStatus.capabilities)).toBe(true);
  });
});
