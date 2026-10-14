import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const cli = path.join(
  path.dirname(require.resolve("@remotion/cli/package.json")),
  "remotion-cli.js",
);
const video = fileURLToPath(
  new URL("../../apps/web/public/media/veyra-product-film.mp4", import.meta.url),
);
const poster = fileURLToPath(
  new URL("../../apps/web/public/media/veyra-product-film-poster.webp", import.meta.url),
);
// Extract the poster from the delivered encode itself. No raw frame file is persisted.
const png = execFileSync(
  process.execPath,
  [
    cli,
    "ffmpeg",
    "-v",
    "error",
    "-ss",
    "19",
    "-i",
    video,
    "-frames:v",
    "1",
    "-f",
    "image2pipe",
    "-c:v",
    "png",
    "pipe:1",
  ],
  { maxBuffer: 16 * 1024 * 1024 },
);
await sharp(png).webp({ quality: 86 }).toFile(poster);
