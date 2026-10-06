import { constants } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ControlledFixtureIntentIdSchema,
  SelectedLinuxHostSchema,
} from "../packages/contracts/src/index";
import {
  previewSelectedLinuxFixture,
  stageSelectedLinuxFixture,
  verifySelectedLinuxHost,
} from "../packages/controlled-reproducer/src/linux-preflight";

async function main() {
  const [operation, flag, file, idFlag, id, ...extra] = process.argv.slice(2);
  const root = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, "");
  if (
    !["verify", "stage", "preview"].includes(operation ?? "") ||
    flag !== "--selection-file" ||
    !file ||
    file.length > 512 ||
    !path.isAbsolute(file) ||
    path.resolve(file) !== file ||
    file === root ||
    file.startsWith(`${root}/`) ||
    process.cwd() !== root ||
    extra.length ||
    (operation === "verify"
      ? idFlag !== undefined || id !== undefined
      : idFlag !== "--intent-id" || !ControlledFixtureIntentIdSchema.safeParse(id).success)
  )
    throw new Error("LINUX_PREFLIGHT_ARGUMENTS");
  if (process.platform !== "linux") throw new Error("LINUX_PLATFORM_MISMATCH");
  const fd = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let selection: unknown;
  try {
    const s = await fd.stat();
    if (
      !s.isFile() ||
      s.nlink !== 1 ||
      s.size > 4096 ||
      s.mode & 0o077 ||
      s.uid !== process.getuid?.() ||
      s.gid !== process.getgid?.()
    )
      throw new Error("LINUX_SELECTION_FILE_UNSAFE");
    const buffer = Buffer.alloc(4097);
    const { bytesRead } = await fd.read(buffer);
    if (bytesRead > 4096) throw new Error("LINUX_SELECTION_LIMIT");
    selection = SelectedLinuxHostSchema.parse(
      JSON.parse(buffer.subarray(0, bytesRead).toString("utf8")),
    );
  } finally {
    await fd.close();
  }
  const result =
    operation === "verify"
      ? await verifySelectedLinuxHost(selection)
      : operation === "stage"
        ? await stageSelectedLinuxFixture(selection, id as string)
        : await previewSelectedLinuxFixture(selection, id as string);
  const output = JSON.stringify(result);
  if (Buffer.byteLength(output) > 32 * 1024) throw new Error("LINUX_PACKET_LIMIT");
  console.log(output);
}
void main().catch(() => {
  console.error("CONTROLLED_LINUX_PREFLIGHT_FAILED");
  process.exitCode = 1;
});
