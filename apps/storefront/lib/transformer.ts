import superjson from "superjson";

/**
 * superjson for the BFF wire format, except that a bare `null` travels as plain JSON `null` (e.g. `auth.me` for a
 * visitor without a session answers `{"result":{"data":null}}`). Both ends of the tRPC link use this transformer.
 */
export const transformer = {
  serialize(value: unknown): unknown {
    return value === null ? null : superjson.serialize(value);
  },
  deserialize(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    return superjson.deserialize(value as Parameters<typeof superjson.deserialize>[0]);
  },
};
