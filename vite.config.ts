import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: process.env.VITEST ? [] : [cloudflare()],
  publicDir: "assets/static",
  fmt: {
    ignorePatterns: [".wrangler/**", "assets/**", "dist/**", "node_modules/**", "*.md", "*.yml"],
  },
  lint: {
    ignorePatterns: [".wrangler/**", "assets/**", "dist/**", "node_modules/**"],
    options: {
      typeAware: false,
      typeCheck: false,
    },
  },
  test: {
    include: ["src/**/*.test.ts", "tools/**/*.test.ts"],
  },
});
