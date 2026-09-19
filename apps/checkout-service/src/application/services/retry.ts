import { isConcurrencyConflict } from "../../domain";

/** Re-runs `work` (which must reload what it changes) when it loses an optimistic-concurrency race. */
export async function retryOnConflict<T>(work: () => Promise<T>, attempts = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await work();
    } catch (error) {
      if (!isConcurrencyConflict(error) || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5 * attempt + Math.floor(Math.random() * 10)));
    }
  }
}
