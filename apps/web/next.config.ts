import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  poweredByHeader: false,
  transpilePackages: [
    "@ai-agent-platform/database",
    "@ai-agent-platform/integrations",
    "@ai-agent-platform/ui",
  ],
};

export default nextConfig;
