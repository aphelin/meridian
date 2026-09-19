/**
 * The slice of a generated Prisma client the messaging kit needs. Any `PrismaClient` (and the interactive
 * transaction client it passes to `$transaction`) satisfies these structurally, so the kit never depends on a
 * service's generated client.
 */
export interface PrismaTx {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

export interface PrismaLike extends PrismaTx {
  /** Deliberately loose: generated clients overload `$transaction` (batch array or interactive callback). */
  $transaction(...args: never[]): Promise<unknown>;
}

/** Runs an interactive transaction with the kit's structural transaction type. */
export function runTransaction<R>(prisma: PrismaLike, fn: (tx: PrismaTx) => Promise<R>, options?: { maxWait?: number; timeout?: number }): Promise<R> {
  const run = prisma.$transaction as unknown as (fn: (tx: PrismaTx) => Promise<R>, options?: { maxWait?: number; timeout?: number }) => Promise<R>;
  return run.call(prisma, fn, options);
}
