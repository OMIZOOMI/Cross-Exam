import { expect, it } from "vitest";
import { startCommand } from "./linux-backend";

it("holds a real child at stdin EOF until release, then captures output and exit", async () => {
  const running = startCommand({
    file: process.execPath,
    args: [
      "-e",
      "let input='';process.stdin.on('data',b=>input+=b);process.stdin.on('end',()=>{process.stdout.write(input);process.exitCode=7})",
    ],
    timeoutMs: 2000,
  });
  let completed = false;
  void running.completion.then(() => {
    completed = true;
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(completed).toBe(false);
    expect(running.finished).toBe(false);
    running.release('{"release":true}\n');
    expect(await running.completion).toMatchObject({
      exitCode: 7,
      stdout: '{"release":true}\n',
      timedOut: false,
    });
    expect(() => running.release("again")).toThrow();
  } finally {
    running.terminate();
  }
});
it("bounds a real launcher waiting at the barrier", async () => {
  const running = startCommand({
    file: process.execPath,
    args: ["-e", "process.stdin.resume()"],
    timeoutMs: 100,
  });
  expect(await running.completion).toMatchObject({ timedOut: true });
  expect(running.finished).toBe(true);
});
it("reports launcher exec failure without releasing a probe", async () => {
  const running = startCommand({
    file: "/nonexistent/crossexam-test-executable",
    args: [],
    timeoutMs: 1000,
  });
  expect(await running.completion).toMatchObject({ exitCode: 127, timedOut: false });
});
