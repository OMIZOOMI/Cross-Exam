/** Offline child-process test fixture. No credentials, API client bootstrap, or real transport. */
import { appendFile } from "node:fs/promises";
import path from "node:path";
import { createOpenAIProvider } from "../../provider-openai/src/index";
import { validTransport } from "../../provider-openai/src/test-fixtures";
import { runWithStore } from "./index";
import { createControlledRelease, ownedNumericFixture } from "./release";
import { RunStore } from "./storage";

const [dir, point] = process.argv.slice(2);
if (!dir || !point) throw new Error("TEST_ARGUMENTS");
const fake = validTransport();
const transport: typeof fetch = async (url, init) => {
  await appendFile(path.join(dir, "calls.txt"), "DISPATCH\n", { mode: 0o600 });
  return fake(url, init);
};
try {
  const store = new RunStore(dir, (name) => {
    if (name === point) process.exit(17);
  });
  const out = await runWithStore(
    ownedNumericFixture(),
    createControlledRelease("owned-release-1"),
    createOpenAIProvider({ transport }),
    store,
  );
  process.send?.({ status: out.status });
} catch {
  process.exitCode = 1;
}
