import { defineConfig } from "vitest/config";

// Unit tests exercise domain and application code with in-memory fakes; no Nest DI, so esbuild is enough.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    setupFiles: ["reflect-metadata"],
    testTimeout: 15_000,
    env: { LOG_LEVEL: "error" },
  },
});
