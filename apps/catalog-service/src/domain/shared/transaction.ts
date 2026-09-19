/**
 * Opaque handle of the unit of work a repository call takes part in. Infrastructure backs it with a database
 * transaction; the domain only passes it through so that an aggregate and its outbox rows commit together.
 */
export type Transaction = object;
