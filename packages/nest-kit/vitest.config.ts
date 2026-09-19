import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// esbuild drops decorator metadata; SWC keeps it so Nest can resolve class-typed constructor injection in tests.
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    testTimeout: 15_000,
    env: { LOG_LEVEL: "error" },
  },
});
