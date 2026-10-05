import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, rename, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import { z } from "zod";
import { hash } from "../../agents/src/provider";
import { type ControlledRelease, ControlledReleaseSchema, RUN_LIMITS } from "./release";

export class StoreError extends Error {
  constructor(
    readonly code: "STORE_BUSY" | "STORE_CORRUPT" | "STORE_CAPACITY" | "STORE_IO" | "SLOT_CONSUMED",
  ) {
    super(code);
  }
}
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const slot = z
  .object({ dispatchHash: digest.nullable(), checkpointHash: digest.nullable() })
  .strict();
export const LedgerSchema = z
  .object({
    version: z.literal(1),
    release: ControlledReleaseSchema,
    inputHash: digest,
    roles: z.object({ Explorer: slot, Breaker: slot }).strict(),
    resultHash: digest.nullable(),
    complete: z.boolean(),
  })
  .strict();
export type Ledger = z.infer<typeof LedgerSchema>;
const LockSchema = z
  .object({ pid: z.number().int().positive(), host: digest, nonce: z.string().uuid() })
  .strict();
const host = hash(hostname());
type Fault = (point: string) => void | Promise<void>;
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === "ENOENT";

/** Same-host local store, not distributed storage or protection against the owning OS user. */
export class RunStore {
  constructor(
    readonly directory: string,
    private readonly fault?: Fault,
  ) {}
  async point(name: string) {
    await this.fault?.(name);
  }
  async privateDirectory(dir: string) {
    const stat = await lstat(dir);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.mode & 0o077 ||
      (process.getuid && stat.uid !== process.getuid())
    )
      throw new StoreError("STORE_CORRUPT");
  }
  async flushDirectory(dir: string) {
    const fd = await open(dir, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      await fd.sync();
    } finally {
      await fd.close();
    }
  }
  async read(dir: string, name: string, cap: number, optional = false): Promise<string | null> {
    let fd: Awaited<ReturnType<typeof open>> | undefined;
    try {
      fd = await open(
        path.join(dir, name),
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      const stat = await fd.stat();
      if (
        !stat.isFile() ||
        stat.size > cap ||
        stat.mode & 0o077 ||
        (process.getuid && stat.uid !== process.getuid())
      )
        throw new StoreError("STORE_CORRUPT");
      // Bound the read independently of stat, even if a same-user writer changes file size.
      const buffer = Buffer.alloc(cap + 1);
      let bytes = 0;
      for (;;) {
        const chunk = await fd.read(buffer, bytes, buffer.length - bytes, null);
        bytes += chunk.bytesRead;
        if (bytes > cap) throw new StoreError("STORE_CORRUPT");
        if (!chunk.bytesRead) break;
      }
      return buffer.subarray(0, bytes).toString("utf8");
    } catch (error) {
      if (optional && missing(error)) return null;
      throw new StoreError("STORE_CORRUPT");
    } finally {
      await fd?.close();
    }
  }
  async publish(dir: string, name: string, value: unknown, cap: number) {
    const json = JSON.stringify(value);
    if (Buffer.byteLength(json) > cap) throw new StoreError("STORE_IO");
    const temporary = path.join(dir, `.${name}-${randomUUID()}.tmp`);
    let fd: Awaited<ReturnType<typeof open>> | undefined;
    try {
      await this.point(`${name}:before-write`);
      fd = await open(
        temporary,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
        0o600,
      );
      await fd.writeFile(json);
      await fd.sync();
      await fd.close();
      fd = undefined;
      await this.point(`${name}:after-flush`);
      await rename(temporary, path.join(dir, name));
      await this.point(`${name}:after-publish`);
      await this.flushDirectory(dir);
      await this.point(`${name}:durable`);
    } finally {
      await fd?.close();
      await unlink(temporary).catch((error) => {
        if (!missing(error)) throw new StoreError("STORE_IO");
      });
    }
  }
  async lock(dir: string, name = "owner.lock"): Promise<() => Promise<void>> {
    const filename = path.join(dir, name);
    const identity = { pid: process.pid, host, nonce: randomUUID() };
    for (let attempt = 0; attempt < 2; attempt++) {
      let fd: Awaited<ReturnType<typeof open>> | undefined;
      try {
        fd = await open(
          filename,
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
          0o600,
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw new StoreError("STORE_IO");
        const raw = await this.read(dir, name, 1024);
        let previous: z.infer<typeof LockSchema>;
        try {
          previous = LockSchema.parse(JSON.parse(raw as string));
        } catch {
          throw new StoreError("STORE_CORRUPT");
        }
        if (previous.host !== host) throw new StoreError("STORE_BUSY");
        // Never reclaim based on age. Reused PID / EPERM / living owner remain fail-closed.
        try {
          process.kill(previous.pid, 0);
          throw new StoreError("STORE_BUSY");
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw new StoreError("STORE_BUSY");
        }
        // Serialize dead-owner recovery using a separate exclusive reclamation file.
        const reclaim = await open(
          `${filename}.reclaim`,
          constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
          0o600,
        ).catch(() => {
          throw new StoreError("STORE_BUSY");
        });
        try {
          const current = await this.read(dir, name, 1024);
          if (current !== raw) throw new StoreError("STORE_BUSY");
          await unlink(filename);
          await this.flushDirectory(dir);
        } finally {
          await reclaim.close();
          await unlink(`${filename}.reclaim`);
        }
        continue;
      }
      try {
        await fd.writeFile(JSON.stringify(identity));
        await fd.sync();
        await this.flushDirectory(dir);
      } finally {
        await fd.close();
      }
      return async () => {
        const current = await this.read(dir, name, 1024);
        if (current !== JSON.stringify(identity)) throw new StoreError("STORE_CORRUPT");
        await unlink(filename);
        await this.flushDirectory(dir);
      };
    }
    throw new StoreError("STORE_BUSY");
  }
  async openRun(
    release: ControlledRelease,
    input: unknown,
  ): Promise<{ dir: string; created: boolean; unlock: () => Promise<void> }> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await this.privateDirectory(this.directory);
    const globalUnlock = await this.lock(this.directory, "admission.lock");
    const dir = path.join(this.directory, release.releaseId);
    let unlock: (() => Promise<void>) | undefined;
    try {
      let created = false;
      try {
        await lstat(dir);
      } catch (error) {
        if (!missing(error)) throw new StoreError("STORE_IO");
        const entries = (await readdir(this.directory, { withFileTypes: true })).filter((e) =>
          e.isDirectory(),
        );
        if (entries.length >= RUN_LIMITS.runs) throw new StoreError("STORE_CAPACITY");
        await mkdir(dir, { mode: 0o700 });
        await this.flushDirectory(this.directory);
        created = true;
      }
      await this.privateDirectory(dir);
      unlock = await this.lock(dir);
      if (created) {
        await this.publish(dir, "input.json", input, RUN_LIMITS.inputBytes);
        const ledger: Ledger = {
          version: 1,
          release,
          inputHash: release.snapshotHash,
          roles: {
            Explorer: { dispatchHash: null, checkpointHash: null },
            Breaker: { dispatchHash: null, checkpointHash: null },
          },
          resultHash: null,
          complete: false,
        };
        await this.publish(dir, "ledger.json", ledger, RUN_LIMITS.ledgerBytes);
        await this.point("reserved");
      }
      return { dir, created, unlock };
    } catch (error) {
      await unlock?.();
      throw error;
    } finally {
      await globalUnlock();
    }
  }
  async ledger(dir: string): Promise<Ledger> {
    try {
      return LedgerSchema.parse(
        JSON.parse((await this.read(dir, "ledger.json", RUN_LIMITS.ledgerBytes)) as string),
      );
    } catch {
      throw new StoreError("STORE_CORRUPT");
    }
  }
  async saveLedger(dir: string, ledger: Ledger) {
    await this.publish(dir, "ledger.json", LedgerSchema.parse(ledger), RUN_LIMITS.ledgerBytes);
  }
}
