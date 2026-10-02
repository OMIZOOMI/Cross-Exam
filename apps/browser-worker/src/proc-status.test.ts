import { describe, expect, it } from "vitest";
import { parseProcStatusIdentity, supplementaryGroupsAreEmptyOrPrimary } from "./proc-status";

const STATUS_HEADER = "Name:\tnode\nUid:\t991\t991\t991\t991\n";

describe("parseProcStatusIdentity", () => {
  it("parses the canonical four-column Gid and empty Groups", () => {
    const identity = parseProcStatusIdentity(`${STATUS_HEADER}Gid:\t991\t991\t991\t991\nGroups:\n`);
    expect(identity).toEqual({ realGid: 991, effectiveGid: 991, supplementaryGroups: [] });
  });

  it("parses a primary-group-only Groups list", () => {
    const identity = parseProcStatusIdentity(
      `${STATUS_HEADER}Gid:\t991\t991\t991\t991\nGroups:\t991\n`,
    );
    expect(identity).toEqual({ realGid: 991, effectiveGid: 991, supplementaryGroups: [991] });
  });

  it("parses multiple supplementary groups", () => {
    const identity = parseProcStatusIdentity(
      `${STATUS_HEADER}Gid:\t991\t991\t991\t991\nGroups:\t991 27 100\n`,
    );
    expect(identity.supplementaryGroups).toEqual([991, 27, 100]);
  });

  it("rejects a malformed Gid field", () => {
    expect(() =>
      parseProcStatusIdentity(`${STATUS_HEADER}Gid:\t991\tabc\t991\t991\nGroups:\n`),
    ).toThrow(/Gid/);
    expect(() => parseProcStatusIdentity(`${STATUS_HEADER}Gid:\t991\t991\t991\nGroups:\n`)).toThrow(
      /Gid/,
    );
  });

  it("rejects a missing Gid field", () => {
    expect(() => parseProcStatusIdentity(`${STATUS_HEADER}Groups:\n`)).toThrow(/Gid/);
  });

  it("rejects a missing Groups field", () => {
    expect(() => parseProcStatusIdentity(`${STATUS_HEADER}Gid:\t991\t991\t991\t991\n`)).toThrow(
      /Groups/,
    );
  });

  it("rejects a malformed Groups field", () => {
    expect(() =>
      parseProcStatusIdentity(`${STATUS_HEADER}Gid:\t991\t991\t991\t991\nGroups:\t991 xyz\n`),
    ).toThrow(/Groups/);
  });

  it("parses a zero Gid without rejecting the format", () => {
    const identity = parseProcStatusIdentity(`${STATUS_HEADER}Gid:\t0\t0\t0\t0\nGroups:\n`);
    expect(identity.realGid).toBe(0);
  });
});

describe("supplementaryGroupsAreEmptyOrPrimary", () => {
  const identity = (realGid: number, supplementaryGroups: number[]) => ({
    realGid,
    effectiveGid: realGid,
    supplementaryGroups,
  });

  it("accepts an empty supplementary list for an unprivileged gid", () => {
    expect(supplementaryGroupsAreEmptyOrPrimary(identity(991, []))).toBe(true);
  });

  it("accepts the primary group alone", () => {
    expect(supplementaryGroupsAreEmptyOrPrimary(identity(991, [991]))).toBe(true);
  });

  it("rejects a privileged zero identity", () => {
    expect(supplementaryGroupsAreEmptyOrPrimary(identity(0, []))).toBe(false);
  });

  it("rejects an unrelated supplementary group", () => {
    expect(supplementaryGroupsAreEmptyOrPrimary(identity(991, [27]))).toBe(false);
  });

  it("rejects multiple supplementary groups", () => {
    expect(supplementaryGroupsAreEmptyOrPrimary(identity(991, [991, 27]))).toBe(false);
  });
});
