import { Injectable } from "@nestjs/common";
import { Commands, type CommandName, type CommandPayloads, type EventName, type EventPayloads } from "@meridian/contracts";
import { randomUUID } from "node:crypto";
import { RequestContext } from "../core";
import { isEventName } from "./config";
import { currentTraceparent } from "./envelope";
import { uuidv7 } from "./ids";
import type { PrismaTx } from "./prisma";

export interface AggregateRef {
  type: string;
  id: string;
}

/**
 * Column values of one `"Outbox"` insert. `createdAt` is the database clock (like Prisma's `@default(now())`), and
 * rows written in the same transaction keep their order through the time-ordered UUIDv7 id the relay sorts by.
 */
export interface OutboxInsert {
  id: string;
  kind: "event" | "command";
  name: string;
  aggregateType: string | null;
  aggregateId: string | null;
  payloadJson: string;
  correlationId: string;
  causationId: string | null;
  traceparent: string | null;
}

const COMMAND_NAMES = new Set<string>(Object.values(Commands));

export function isCommandName(name: unknown): name is CommandName {
  return typeof name === "string" && COMMAND_NAMES.has(name);
}

function assertAggregate(aggregate: AggregateRef | undefined, name: string): void {
  if (aggregate === undefined) return;
  if (typeof aggregate !== "object" || aggregate === null) throw new TypeError(`Outbox ${name}: aggregate must be { type, id }`);
  if (typeof aggregate.type !== "string" || !aggregate.type.trim()) throw new TypeError(`Outbox ${name}: aggregate.type must be a non-empty string`);
  if (typeof aggregate.id !== "string" || !aggregate.id.trim()) throw new TypeError(`Outbox ${name}: aggregate.id must be a non-empty string`);
}

function serializePayload(payload: unknown, name: string): string {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) throw new TypeError(`Outbox ${name}: payload must be a JSON object`);
  let json: string | undefined;
  try {
    json = JSON.stringify(payload);
  } catch (error) {
    throw new TypeError(`Outbox ${name}: payload is not JSON-serializable (${error instanceof Error ? error.message : String(error)})`);
  }
  if (json === undefined) throw new TypeError(`Outbox ${name}: payload is not JSON-serializable`);
  return json;
}

/**
 * Validates and builds one outbox row. Names must exist in contracts `Events` / `Commands`; correlation and
 * causation come from the current `RequestContext` (a fresh correlation id outside any context), and the
 * traceparent from the active OpenTelemetry span.
 */
export function buildOutboxInsert(kind: "event" | "command", name: string, payload: unknown, aggregate?: AggregateRef): OutboxInsert {
  if (kind === "event" && !isEventName(name)) throw new TypeError(`Outbox: unknown event name "${String(name)}"`);
  if (kind === "command" && !isCommandName(name)) throw new TypeError(`Outbox: unknown command name "${String(name)}"`);
  if (kind === "event" && aggregate === undefined) throw new TypeError(`Outbox ${name}: events require an aggregate`);
  assertAggregate(aggregate, name);
  const payloadJson = serializePayload(payload, name);
  const ctx = RequestContext.get();
  return {
    id: uuidv7(),
    kind,
    name,
    aggregateType: aggregate?.type ?? null,
    aggregateId: aggregate?.id ?? null,
    payloadJson,
    correlationId: ctx?.correlationId || randomUUID(),
    causationId: ctx?.causationId ?? null,
    traceparent: currentTraceparent(),
  };
}

export async function insertOutboxRow(tx: PrismaTx, row: OutboxInsert): Promise<string> {
  const inserted = await tx.$executeRaw`
    INSERT INTO "Outbox" ("id", "kind", "name", "aggregateType", "aggregateId", "payload", "correlationId", "causationId", "traceparent", "createdAt", "attempts")
    VALUES (${row.id}, ${row.kind}, ${row.name}, ${row.aggregateType}, ${row.aggregateId}, ${row.payloadJson}::jsonb, ${row.correlationId}, ${row.causationId}, ${row.traceparent}, CURRENT_TIMESTAMP, 0)`;
  if (inserted !== 1) throw new Error(`Outbox insert for ${row.name} affected ${inserted} rows`);
  return row.id;
}

/**
 * Transactional outbox writer. Call inside the same `$transaction` that persists the aggregate so the message is
 * published if and only if the state change commits. Returns the messageId (= outbox row id).
 */
@Injectable()
export class OutboxWriter {
  event<N extends EventName>(tx: PrismaTx, name: N, aggregate: AggregateRef, payload: EventPayloads[N]): Promise<string> {
    return insertOutboxRow(tx, buildOutboxInsert("event", name, payload, aggregate));
  }

  command<N extends CommandName>(tx: PrismaTx, name: N, payload: CommandPayloads[N], opts?: { aggregate?: AggregateRef }): Promise<string> {
    return insertOutboxRow(tx, buildOutboxInsert("command", name, payload, opts?.aggregate));
  }
}
