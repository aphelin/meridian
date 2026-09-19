import { randomUUID } from "node:crypto";

/** Random UUID for aggregate and entity identities. */
export const newId = (): string => randomUUID();
