// Compiles src to dist and places the generated Prisma client at dist/generated/prisma (contract build layout).
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
rmSync(join(root, "dist"), { recursive: true, force: true });
const tsc = require.resolve("typescript/bin/tsc");
const result = spawnSync(process.execPath, [tsc, "-p", "tsconfig.build.json"], { cwd: root, stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
const generated = join(root, "src/generated");
if (!existsSync(join(generated, "prisma"))) {
  console.error("src/generated/prisma is missing: run `npm run prisma:generate -w catalog-service` first");
  process.exit(1);
}
cpSync(generated, join(root, "dist/generated"), { recursive: true });
