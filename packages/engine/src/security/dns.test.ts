import { Resolver } from "node:dns/promises";
import { networkInterfaces } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveHost, validateAnswers } from "./dns";

vi.mock("node:dns/promises", () => ({ Resolver: vi.fn() }));
vi.mock("node:os", () => ({ networkInterfaces: vi.fn(() => ({})) }));
const a = vi.fn<() => Promise<string[]>>();
const aaaa = vi.fn<() => Promise<string[]>>();
const cancel = vi.fn();
const error = (code: string) => Object.assign(new Error(code), { code });
beforeEach(() => {
  vi.clearAllMocks();
  a.mockReset();
  aaaa.mockReset();
  cancel.mockReset();
  a.mockResolvedValue(["93.184.216.34"]);
  aaaa.mockResolvedValue(["2606:4700::1111"]);
  // biome-ignore lint/complexity/useArrowFunction: Resolver is invoked as a constructor.
  vi.mocked(Resolver).mockImplementation(function () {
    return { resolve4: a, resolve6: aaaa, cancel } as unknown as Resolver;
  });
});

afterEach(() => vi.restoreAllMocks());

describe("production A and AAAA resolver adapter", () => {
  it("queries both families with an absolute DNS name and releases the resolver", async () => {
    expect(await resolveHost("example.com", new AbortController().signal)).toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:4700::1111", family: 6 },
    ]);
    expect(a).toHaveBeenCalledWith("example.com.");
    expect(aaaa).toHaveBeenCalledWith("example.com.");
    expect(cancel).toHaveBeenCalled();
  });
  it.each([4, 6])("allows ENODATA for family %s when the other has records", async (family) => {
    (family === 4 ? a : aaaa).mockRejectedValue(error("ENODATA"));
    expect(await resolveHost("example.com", new AbortController().signal)).toHaveLength(1);
  });
  it.each(["ENOTFOUND", "ETIMEOUT", "ESERVFAIL", "EREFUSED", "ECANCELLED", "EAI_AGAIN"])(
    "fails closed on %s even if the other family is public",
    async (code) => {
      aaaa.mockRejectedValue(error(code));
      await expect(resolveHost("example.com", new AbortController().signal)).rejects.toMatchObject({
        reason: "DNS_RESOLUTION_FAILED",
      });
      expect(cancel).toHaveBeenCalled();
    },
  );
  it("does not begin queries for a cancelled request", async () => {
    await expect(resolveHost("example.com", AbortSignal.abort())).rejects.toThrow();
    expect(a).not.toHaveBeenCalled();
  });
  it("cancels the actual DNS resolver on abort", async () => {
    const controller = new AbortController();
    let stop: (reason: Error) => void = () => {};
    a.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          stop = reject;
        }),
    );
    cancel.mockImplementation(() => stop(error("ECANCELLED")));
    const pending = resolveHost("example.com", controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ reason: "DNS_RESOLUTION_FAILED" });
    expect(cancel).toHaveBeenCalled();
  });
});

it("blocks DNS pointing to the scanner's own public interface", () => {
  vi.mocked(networkInterfaces).mockReturnValue({
    eth0: [
      {
        address: "93.184.216.34",
        family: "IPv4",
        netmask: "255.255.255.0",
        mac: "00:00:00:00:00:00",
        internal: false,
        cidr: "93.184.216.34/24",
      },
    ],
  });
  expect(() => validateAnswers([{ address: "93.184.216.34", family: 4 }])).toThrow(
    expect.objectContaining({ reason: "UNSAFE_DNS_RESULT", classification: "local-interface" }),
  );
});
