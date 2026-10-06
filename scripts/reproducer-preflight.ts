import path from "node:path";
import { fileURLToPath } from "node:url";
import { ControlledFixtureIntentIdSchema } from "../packages/contracts/src/index";
import {
  renderPendingFixturePacket,
  stageOwnedFixture,
} from "../packages/controlled-reproducer/src/fixture-preflight";

/** Operator metadata only. No execute/approve option or configuration/target override. */
async function main() {
  const [operation, flag, id, storageFlag, directory, ...extra] = process.argv.slice(2);
  const root = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, "");
  if (
    !["stage", "preview"].includes(operation ?? "") ||
    flag !== "--intent-id" ||
    storageFlag !== "--directory" ||
    extra.length ||
    !ControlledFixtureIntentIdSchema.safeParse(id).success ||
    !directory ||
    directory.length > 512 ||
    !path.isAbsolute(directory) ||
    path.resolve(directory) !== directory ||
    directory === root ||
    directory.startsWith(`${root}/`) ||
    process.cwd() !== root
  )
    throw new Error("PREFLIGHT_ARGUMENTS");
  const options = { directory };
  if (operation === "stage") await stageOwnedFixture(id as string, options);
  const packet = await renderPendingFixturePacket(id as string, options);
  console.log(JSON.stringify(packet, null, 2));
}
void main().catch(() => {
  console.error("CONTROLLED_FIXTURE_PREFLIGHT_FAILED");
  process.exitCode = 1;
});
