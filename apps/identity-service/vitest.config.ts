import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.int.test.ts"],
    testTimeout: 15_000,
    env: { LOG_LEVEL: "error" },
  },
});
