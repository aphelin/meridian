import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    testTimeout: 10_000,
    env: { LOG_LEVEL: "error" },
  },
});
