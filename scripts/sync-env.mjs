#!/usr/bin/env node
// Appends to .env every key that .env.example defines and .env lacks, using the example value.
// Existing lines are never rewritten, reordered or duplicated, so re-running is a no-op.
// Only key names are printed, never values.
//
// usage: node scripts/sync-env.mjs [--check] [--example <path>] [--env <path>]
//   --check  report missing keys and exit 1 instead of writing
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? resolve(args[i + 1]) : fallback;
};
const check = args.includes("--check");
const examplePath = option("--example", join(root, ".env.example"));
const envPath = option("--env", join(root, ".env"));
const show = (p) => {
  const rel = relative(process.cwd(), p);
  return rel && !rel.startsWith("..") ? rel : p;
};

const KEY_LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

/** Ordered entries of KEY=value lines; the first occurrence of a key wins (like dotenv). */
function parse(text) {
  const entries = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = KEY_LINE.exec(line);
    if (m && !entries.has(m[1])) entries.set(m[1], { line: line.trim(), value: m[2].trim() });
  }
  return entries;
}

if (!existsSync(examplePath)) {
  console.error(`sync-env: ${show(examplePath)} not found`);
  process.exit(1);
}
const example = parse(readFileSync(examplePath, "utf8"));
const envText = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const current = parse(envText);

const missing = [...example.keys()].filter((key) => !current.has(key));
const blankButDefaulted = [...example.entries()]
  .filter(([key, { value }]) => value !== "" && current.has(key) && current.get(key).value === "")
  .map(([key]) => key);

if (check) {
  if (missing.length) {
    console.error(`sync-env: ${show(envPath)} lacks ${missing.length} key(s): ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log(`sync-env: ${show(envPath)} has every key from ${show(examplePath)}`);
  process.exit(0);
}

if (missing.length) {
  const lines = missing.map((key) => example.get(key).line.replace(/^export\s+/, ""));
  const separator = envText === "" || envText.endsWith("\n") ? "" : "\n";
  const block = `${separator}${envText === "" ? "" : "\n"}# Added by scripts/sync-env.mjs from .env.example\n${lines.join("\n")}\n`;
  if (existsSync(envPath)) appendFileSync(envPath, block);
  else writeFileSync(envPath, block.trimStart(), { mode: 0o600 });
  console.log(`sync-env: added ${missing.length} key(s) to ${show(envPath)}: ${missing.join(", ")}`);
} else {
  console.log(`sync-env: ${show(envPath)} already has every key from ${show(examplePath)}`);
}

if (blankButDefaulted.length) {
  console.log(`sync-env: note, empty in ${show(envPath)} but defaulted in the example (left untouched): ${blankButDefaulted.join(", ")}`);
}
