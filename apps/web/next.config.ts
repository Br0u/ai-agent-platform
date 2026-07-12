import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": [
      "../../node_modules/.pnpm/@node-rs+argon2@*/node_modules/@node-rs/argon2/**/*",
      "../../node_modules/.pnpm/@node-rs+argon2-*/node_modules/@node-rs/argon2-*/*",
    ],
  },
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2"],
  transpilePackages: [
    "@ai-agent-platform/database",
    "@ai-agent-platform/integrations",
    "@ai-agent-platform/ui",
  ],
  webpack(config, { isServer }) {
    if (isServer && Array.isArray(config.externals)) {
      config.externals.push("@node-rs/argon2");
    }
    return config;
  },
};

export default nextConfig;
