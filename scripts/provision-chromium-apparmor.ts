import { readFile } from "node:fs/promises";
import {
  CHROMIUM_APPARMOR,
  installChromiumAppArmorProfile,
  removeChromiumAppArmorProfile,
} from "../apps/browser-worker/src/linux-apparmor";

const action = process.argv[2];
if (process.argv.length !== 3 || (action !== "install" && action !== "cleanup"))
  throw new Error("Only fixed Chromium AppArmor install/cleanup operations are supported");

if (action === "install") {
  const executable = await installChromiumAppArmorProfile();
  console.log(
    JSON.stringify({ phase: "apparmor-loaded", profile: CHROMIUM_APPARMOR.profile, ...executable }),
  );
} else {
  await removeChromiumAppArmorProfile();
  const enabled = (await readFile("/sys/module/apparmor/parameters/enabled", "utf8")).trim();
  const restricted = (
    await readFile("/proc/sys/kernel/apparmor_restrict_unprivileged_userns", "utf8")
  ).trim();
  if (enabled !== "Y" || restricted !== "1")
    throw new Error("AppArmor restriction changed during cleanup");
  console.log(
    JSON.stringify({
      phase: "apparmor-unloaded",
      profile: CHROMIUM_APPARMOR.profile,
      apparmorEnabled: true,
      usernsRestriction: 1,
    }),
  );
}
