import {
  renderOperatorOutput,
  runOperator,
  safeOperatorError,
} from "./provider-acceptance/operator";

// This executable is never imported by the web/scanner/browser application.
const controller = new AbortController();
const abort = () => controller.abort();
process.once("SIGINT", abort);
process.once("SIGTERM", abort);
try {
  const output = await runOperator(process.argv.slice(2), {
    // Evaluated only after an explicit valid execute command; no dotenv/key discovery.
    readCredential: () => process.env.CROSSEXAM_OPENAI_API_KEY,
    signal: controller.signal,
  });
  process.stdout.write(`${renderOperatorOutput(output)}\n`);
  if (output.operation === "execute" && output.status !== "completed") process.exitCode = 2;
} catch (error) {
  process.stderr.write(`${JSON.stringify(safeOperatorError(error))}\n`);
  process.exitCode = 1;
} finally {
  process.removeListener("SIGINT", abort);
  process.removeListener("SIGTERM", abort);
}
