import { defineConfig } from "vitest/config";

// Domain and application unit tests use in-memory fakes and construct handlers directly: no Nest DI, esbuild is enough.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.int.test.ts"],
    setupFiles: ["reflect-metadata"],
    testTimeout: 15_000,
    env: { LOG_LEVEL: "error" },
  },
});
