import { describe, expect, it } from "vitest";
import {
  EXPECTED_ROOT_ENTRIES,
  manifestEntryIssue,
  ROOT_MANIFEST_NAME,
  rootLayoutIssues,
} from "./linux-root-layout";

const CANONICAL = Object.freeze([
  ROOT_MANIFEST_NAME,
  "app",
  "bin",
  "browser",
  "dev",
  "etc",
  "lib",
  "lib64",
  "proc",
  "root",
  "run",
  "runtime",
  "sys",
  "tmp",
  "usr",
  "var",
]);

describe("rootLayoutIssues", () => {
  it("accepts the canonical top-level layout including the manifest", () => {
    expect(rootLayoutIssues(CANONICAL)).toEqual([]);
    expect(EXPECTED_ROOT_ENTRIES).toEqual(CANONICAL);
  });

  it("rejects a layout missing the sealed manifest", () => {
    const issues = rootLayoutIssues(CANONICAL.filter((name) => name !== ROOT_MANIFEST_NAME));
    expect(issues).toEqual([{ type: "missing-manifest" }]);
  });

  it("rejects an arbitrary extra top-level entry", () => {
    expect(rootLayoutIssues([...CANONICAL, "unexpected"])).toEqual([
      { type: "unexpected", name: "unexpected" },
    ]);
  });

  it("rejects an arbitrary dotfile", () => {
    expect(rootLayoutIssues([...CANONICAL, ".host-sentinel"])).toEqual([
      { type: "unexpected", name: ".host-sentinel" },
    ]);
  });

  it("rejects a similarly named manifest file", () => {
    expect(rootLayoutIssues([...CANONICAL, ".crossexam-root-manifest.json.bak"])).toEqual([
      { type: "unexpected", name: ".crossexam-root-manifest.json.bak" },
    ]);
    expect(rootLayoutIssues([...CANONICAL, ".crossexam-root-manifest.json "])).toEqual([
      { type: "unexpected", name: ".crossexam-root-manifest.json " },
    ]);
  });
});

describe("manifestEntryIssue", () => {
  it("accepts a regular non-writable file", () => {
    expect(manifestEntryIssue({ isFile: true, isSymbolicLink: false, mode: 0o444 })).toBeNull();
  });

  it("rejects a non-regular file", () => {
    expect(manifestEntryIssue({ isFile: false, isSymbolicLink: false, mode: 0o444 })).toBe(
      "MANIFEST_NOT_REGULAR_FILE",
    );
  });

  it("rejects a symlink", () => {
    expect(manifestEntryIssue({ isFile: false, isSymbolicLink: true, mode: 0o777 })).toBe(
      "MANIFEST_SYMLINK",
    );
  });

  it("rejects a worker-writable manifest", () => {
    expect(manifestEntryIssue({ isFile: true, isSymbolicLink: false, mode: 0o666 })).toBe(
      "MANIFEST_WRITABLE",
    );
    expect(manifestEntryIssue({ isFile: true, isSymbolicLink: false, mode: 0o664 })).toBe(
      "MANIFEST_WRITABLE",
    );
  });

  it("accepts a non-worker-writable manifest owned by root", () => {
    expect(manifestEntryIssue({ isFile: true, isSymbolicLink: false, mode: 0o644 })).toBeNull();
  });
});
