import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: process.env.VITEST ? [] : [cloudflare()],
  publicDir: "assets/static",
  fmt: {
    ignorePatterns: [
      ".wrangler/**",
      "assets/**",
      "dist/**",
      "lib/**",
      "native/**",
      "priv/**",
      "test/**",
      "worker/**",
      "*.exs",
      "*.lock",
      "*.md",
      "*.toml",
      "*.yml",
      "Dockerfile",
      "Makefile",
      "README.md",
      "renovate.json",
      "rel/**",
      "sample.env",
      "startup.sh",
    ],
  },
  lint: {
    ignorePatterns: [
      ".wrangler/**",
      "assets/**",
      "dist/**",
      "lib/**",
      "native/**",
      "priv/**",
      "test/**",
      "worker/**",
    ],
    options: {
      typeAware: false,
      typeCheck: false,
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
