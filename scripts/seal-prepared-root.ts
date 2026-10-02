import { sealRoot } from "../apps/browser-worker/src/linux-root";

const target = process.argv[2];
if (typeof target !== "string" || !target.startsWith("/") || target.includes("\0")) {
  throw new Error("Prepared root path must be an absolute host path.");
}
await sealRoot(target);
