import { randomBytes } from "node:crypto";

let lastMs = -1;
let sequence = 0;

/**
 * RFC 9562 UUIDv7: 48-bit Unix milliseconds, then a 12-bit counter that keeps ids generated in the same millisecond
 * strictly increasing within the process, then random bits. The outbox orders rows by ("createdAt", "id"), so rows
 * written in one transaction keep their write order.
 */
export function uuidv7(now: number = Date.now()): string {
  let ms = now;
  if (ms <= lastMs) {
    ms = lastMs;
    sequence += 1;
    if (sequence > 0xfff) {
      // Counter exhausted inside one millisecond: borrow the next millisecond to stay monotonic.
      ms = lastMs + 1;
      sequence = 0;
    }
  } else {
    sequence = 0;
  }
  lastMs = ms;

  const bytes = randomBytes(16);
  const high = Math.floor(ms / 2 ** 16);
  const low = ms % 2 ** 16;
  bytes.writeUInt32BE(high >>> 0, 0);
  bytes.writeUInt16BE(low, 4);
  bytes[6] = 0x70 | ((sequence >> 8) & 0x0f);
  bytes[7] = sequence & 0xff;
  bytes[8] = 0x80 | (bytes[8] & 0x3f);
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
