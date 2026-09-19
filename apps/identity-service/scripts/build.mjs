// Compiles src to dist and places the generated Prisma client where the compiled code resolves it (dist/generated/prisma).
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const generated = join(root, "src/generated/prisma");
if (!existsSync(join(generated, "index.js"))) {
  console.error("src/generated/prisma is missing; run `npm run prisma:generate` first");
  process.exit(1);
}
rmSync(join(root, "dist"), { recursive: true, force: true });
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
const result = spawnSync(process.execPath, [tsc, "-p", "tsconfig.build.json"], { cwd: root, stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
cpSync(generated, join(root, "dist/generated/prisma"), { recursive: true });
console.log("identity-service built to dist/main.js");
