/**
 * Bounded polling on an observable outcome. `fn` returns a truthy value when the outcome is observed; errors thrown
 * by `fn` count as "not yet" and the last one is reported on timeout.
 */
export async function waitFor<T>(
  fn: () => Promise<T | null | undefined | false> | T | null | undefined | false,
  what: string,
  { timeoutMs = 30_000, intervalMs = 500 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  let lastValue: unknown;
  for (;;) {
    try {
      const value = await fn();
      if (value) return value as T;
      lastValue = value;
    } catch (error) {
      lastError = error;
    }
    if (Date.now() >= deadline) break;
    await pause(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
  }
  const detail = lastError instanceof Error ? ` (last error: ${lastError.message})` : lastValue !== undefined ? ` (last value: ${String(lastValue)})` : "";
  throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}${detail}`);
}

/** Poll interval helper; never used in place of an assertion. */
export const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Keeps polling while `fn` stays true for the whole window; fails as soon as it turns false (used for "never happens"). */
export async function holdsFor(fn: () => Promise<boolean> | boolean, what: string, { windowMs = 3000, intervalMs = 500 } = {}): Promise<void> {
  const end = Date.now() + windowMs;
  while (Date.now() < end) {
    if (!(await fn())) throw new Error(`expected ${what} to keep holding for ${windowMs}ms`);
    await pause(intervalMs);
  }
  if (!(await fn())) throw new Error(`expected ${what} to keep holding for ${windowMs}ms`);
}
