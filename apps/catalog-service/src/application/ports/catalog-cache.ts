/** Shared cache-aside store for hot catalog reads. Failures degrade to loading from the database. */
export abstract class CatalogCache {
  /** Returns the cached value for `key` or loads, stores (for `ttlSec`) and returns it. */
  abstract readThrough<T>(key: string, ttlSec: number, load: () => Promise<T>): Promise<T>;
  /** Invalidates every cached catalog read on all replicas; call after a write has committed. */
  abstract invalidate(): Promise<void>;
}
