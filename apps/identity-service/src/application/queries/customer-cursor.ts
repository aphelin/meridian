import { ValidationError } from "@meridian/kernel";

export interface CustomerCursor {
  createdAt: Date;
  id: string;
}

/** Opaque keyset cursor over (createdAt DESC, id DESC). */
export const CustomerCursorCodec = {
  encode(cursor: CustomerCursor): string {
    return Buffer.from(JSON.stringify([cursor.createdAt.toISOString(), cursor.id]), "utf8").toString("base64url");
  },
  decode(raw: string): CustomerCursor {
    try {
      const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
      if (Array.isArray(parsed) && parsed.length === 2 && typeof parsed[0] === "string" && typeof parsed[1] === "string") {
        const createdAt = new Date(parsed[0]);
        if (!Number.isNaN(createdAt.getTime()) && parsed[1]) return { createdAt, id: parsed[1] };
      }
    } catch {
      // fall through
    }
    throw new ValidationError("Invalid cursor.", { field: "cursor" });
  },
};
