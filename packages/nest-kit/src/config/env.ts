/** Configuration readers that fail fast on malformed values instead of silently using a default. */

function raw(name: string, env: NodeJS.ProcessEnv): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

export function requireEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = raw(name, env);
  if (value === undefined) throw new Error(`Environment variable ${name} is required`);
  return value;
}

export interface EnvIntOptions {
  min?: number;
  max?: number;
  env?: NodeJS.ProcessEnv;
}

/** Integer from the environment; `fallback` when unset or empty; throws when set but not an integer within bounds. */
export function envInt(name: string, fallback: number, options: EnvIntOptions = {}): number {
  const { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, env = process.env } = options;
  const value = raw(name, env);
  if (value === undefined) return fallback;
  if (!/^-?\d+$/.test(value)) throw new Error(`Environment variable ${name} must be an integer, got "${value}"`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Environment variable ${name} must be an integer between ${min} and ${max}, got ${value}`);
  }
  return parsed;
}

/** Comma-separated list with blanks removed; `fallback` when unset or empty. */
export function envList(name: string, fallback: string[] = [], env: NodeJS.ProcessEnv = process.env): string[] {
  const value = raw(name, env);
  if (value === undefined) return [...fallback];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
