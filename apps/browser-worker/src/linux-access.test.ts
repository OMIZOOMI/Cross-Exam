import { access } from "node:fs/promises";
import { afterEach, expect, it, vi } from "vitest";
import { AccessDeniedError, expectDeniedPath } from "./linux-access";

vi.mock("node:fs/promises", () => ({
  access: vi.fn(),
}));

const accessMock = vi.mocked(access);

afterEach(() => {
  accessMock.mockReset();
});

function denyWith(code: string): void {
  accessMock.mockRejectedValue(Object.assign(new Error(code), { code }));
}

function allow(): void {
  accessMock.mockResolvedValue(undefined);
}

it.each(["ENOENT", "EACCES", "EPERM"])("classifies intentional denial %s", async (code) => {
  denyWith(code);
  await expect(expectDeniedPath("/host/file", "read", "host-file")).resolves.toBe(code);
});

it.each(["EIO", "EMFILE", "ENOSPC", "ESTALE"])(
  "does not turn %s into hidden-path success",
  async (code) => {
    denyWith(code);
    await expect(expectDeniedPath("/host/file", "read", "host-file")).rejects.toMatchObject({
      operation: "read",
      label: "host-file",
      code,
    });
    await expect(expectDeniedPath("/host/file", "read", "host-file")).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
  },
);

it("fails if forbidden access succeeds", async () => {
  allow();
  await expect(expectDeniedPath("/host/file", "read", "host-file")).rejects.toMatchObject({
    code: "ACCESS_SUCCEEDED",
  });
});

it("requires an actual read-only error for immutable writes", async () => {
  denyWith("EROFS");
  await expect(expectDeniedPath("/app", "write", "app", ["EROFS"])).resolves.toBe("EROFS");

  denyWith("EACCES");
  await expect(expectDeniedPath("/app", "write", "app", ["EROFS"])).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
});

it("treats an error without a code as an unexpected failure", async () => {
  accessMock.mockRejectedValue(new Error("broken"));
  await expect(expectDeniedPath("/host/file", "read", "host-file")).rejects.toMatchObject({
    code: "UNKNOWN",
  });
});
