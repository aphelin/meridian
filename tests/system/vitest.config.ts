import { defineConfig } from "vitest/config";

// Cross-service system tests against the shared stack started by .unlazy/platform/checks/stack.mjs.
// Run only through `node .unlazy/platform/checks/system-tests.mjs`, which holds the exclusive stack session
// and provides the stack env. SYSTEM_TESTS_FILTER (substring of a spec file name) narrows a run while developing.
const filter = process.env.SYSTEM_TESTS_FILTER;

export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: [filter ? `specs/**/*${filter}*.test.ts` : "specs/**/*.test.ts"],
    globalSetup: ["./support/global-setup.ts"],
    pool: "forks",
    // Chaos rules and replicas are stack-wide: files and tests never run concurrently.
    fileParallelism: false,
    maxWorkers: 1,
    sequence: { concurrent: false, shuffle: false },
    testTimeout: 180_000,
    hookTimeout: 150_000,
    teardownTimeout: 60_000,
    retry: 0,
  },
});
