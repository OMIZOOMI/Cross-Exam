import { describe, expect, it } from "vitest";
import * as publicApi from "./index";

describe("browser egress public API", () => {
  it("exposes only the fixed-dependency production starter at runtime", async () => {
    expect(Object.keys(publicApi)).toEqual(["startEgressProxy"]);
    expect(publicApi.startEgressProxy).toHaveLength(0);
    const proxy = await publicApi.startEgressProxy();
    expect(proxy.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    await proxy.close();
  });
});
