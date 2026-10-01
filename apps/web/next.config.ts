import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@crossexam/contracts", "@crossexam/engine", "@crossexam/scanner"],
  poweredByHeader: false,
  // Await the local report lookup before headers so missing reports really return 404.
  htmlLimitedBots: /.*/,
};

export default config;
