import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, rename, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import { CONTROLLED_REPRODUCER_LIMITS as L } from "@crossexam/contracts";
import { z } from "zod";
import { hash } from "../../agents/src/provider";

export class ControlledStoreError extends Error {
  constructor(
    readonly code:
      | "STORE_BUSY"
      | "STORE_CORRUPT"
      | "STORE_CAPACITY"
      | "STORE_IO"
      | "BINDING_MISMATCH",
  ) {
    super(code);
  }
}
const LockSchema = z
  .object({
    pid: z.number().int().positive(),
    host: z.string().regex(/^[a-f0-9]{64}$/),
    nonce: z.string().uuid(),
  })
  .strict();
const host = hash(hostname());
const missing = (e: unknown) => (e as NodeJS.ErrnoException)?.code === "ENOENT";
export type Fault = (point: string) => void | Promise<void>;

/** Trusted same-host/OS-account storage. No provider releases, distributed lock or age reclaim. */
export class ControlledStore {
  constructor(
    readonly directory: string,
    private readonly fault?: Fault,
  ) {}
  async point(name: string) {
    await this.fault?.(name);
  }
  async privateDirectory(dir: string) {
    const s = await lstat(dir);
    if (
      !s.isDirectory() ||
      s.isSymbolicLink() ||
      s.mode & 0o077 ||
      (process.getuid && s.uid !== process.getuid())
    )
      throw new ControlledStoreError("STORE_CORRUPT");
  }
  async flush(dir: string) {
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
      const s = await fd.stat();
      if (
        !s.isFile() ||
        s.nlink !== 1 ||
        s.size > cap ||
        s.mode & 0o077 ||
        (process.getuid && s.uid !== process.getuid())
      )
        throw new ControlledStoreError("STORE_CORRUPT");
      const buffer = Buffer.alloc(cap + 1);
      let bytes = 0;
      for (;;) {
        const part = await fd.read(buffer, bytes, buffer.length - bytes, null);
        bytes += part.bytesRead;
        if (bytes > cap) throw new ControlledStoreError("STORE_CORRUPT");
        if (!part.bytesRead) break;
      }
      return buffer.subarray(0, bytes).toString("utf8");
    } catch (e) {
      if (optional && missing(e)) return null;
      throw new ControlledStoreError("STORE_CORRUPT");
    } finally {
      await fd?.close();
    }
  }
  async publish(dir: string, name: string, value: unknown, cap: number) {
    const json = JSON.stringify(value);
    if (Buffer.byteLength(json) > cap) throw new ControlledStoreError("STORE_IO");
    await this.read(dir, name, cap, true); // Refuse replacing an unsafe existing inode.
    const tmp = path.join(dir, `.${name}-${randomUUID()}.tmp`);
    let fd: Awaited<ReturnType<typeof open>> | undefined;
    try {
      await this.point(`${name}:before-write`);
      fd = await open(
        tmp,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
        0o600,
      );
      await fd.writeFile(json);
      await fd.sync();
      await fd.close();
      fd = undefined;
      await this.point(`${name}:after-flush`);
      await rename(tmp, path.join(dir, name));
      await this.point(`${name}:after-publish`);
      await this.flush(dir);
      await this.point(`${name}:durable`);
    } finally {
      await fd?.close();
      await unlink(tmp).catch((e) => {
        if (!missing(e)) throw new ControlledStoreError("STORE_IO");
      });
    }
  }
  async lock(dir: string, name = "owner.lock"): Promise<() => Promise<void>> {
    const file = path.join(dir, name);
    const identity = JSON.stringify({ pid: process.pid, host, nonce: randomUUID() });
    for (let attempt = 0; attempt < 2; attempt++) {
      let fd: Awaited<ReturnType<typeof open>>;
      try {
        fd = await open(
          file,
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
          0o600,
        );
      } catch (e) {
        if ((e as NodeJS.ErrnoException)?.code !== "EEXIST")
          throw new ControlledStoreError("STORE_IO");
        const raw = await this.read(dir, name, 1024);
        let previous: z.infer<typeof LockSchema>;
        try {
          previous = LockSchema.parse(JSON.parse(raw as string));
        } catch {
          throw new ControlledStoreError("STORE_CORRUPT");
        }
        if (previous.host !== host) throw new ControlledStoreError("STORE_BUSY");
        try {
          process.kill(previous.pid, 0);
          throw new ControlledStoreError("STORE_BUSY");
        } catch (e) {
          if ((e as NodeJS.ErrnoException)?.code !== "ESRCH")
            throw new ControlledStoreError("STORE_BUSY");
        }
        const reclaim = await open(
          `${file}.reclaim`,
          constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
          0o600,
        ).catch(() => {
          throw new ControlledStoreError("STORE_BUSY");
        });
        try {
          if ((await this.read(dir, name, 1024)) !== raw)
            throw new ControlledStoreError("STORE_BUSY");
          await unlink(file);
          await this.flush(dir);
        } finally {
          await reclaim.close();
          await unlink(`${file}.reclaim`);
        }
        continue;
      }
      try {
        await fd.writeFile(identity);
        await fd.sync();
        await this.flush(dir);
      } finally {
        await fd.close();
      }
      return async () => {
        if ((await this.read(dir, name, 1024)) !== identity)
          throw new ControlledStoreError("STORE_CORRUPT");
        await unlink(file);
        await this.flush(dir);
      };
    }
    throw new ControlledStoreError("STORE_BUSY");
  }
  async openRun(intentId: string, create: boolean) {
    if (create) await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await this.privateDirectory(this.directory);
    const admissionUnlock = await this.lock(this.directory, "admission.lock");
    const dir = path.join(this.directory, intentId);
    let unlock: (() => Promise<void>) | undefined;
    try {
      let created = false;
      try {
        await lstat(dir);
      } catch (e) {
        if (!missing(e) || !create) throw new ControlledStoreError("STORE_CORRUPT");
        if (
          (await readdir(this.directory, { withFileTypes: true })).filter((v) => v.isDirectory())
            .length >= L.runs
        )
          throw new ControlledStoreError("STORE_CAPACITY");
        await mkdir(dir, { mode: 0o700 });
        await this.flush(this.directory);
        created = true;
      }
      await this.privateDirectory(dir);
      if ((await readdir(dir)).length > 8) throw new ControlledStoreError("STORE_CAPACITY");
      unlock = await this.lock(dir);
      return { dir, created, unlock };
    } catch (e) {
      await unlock?.();
      throw e;
    } finally {
      await admissionUnlock();
    }
  }
}
