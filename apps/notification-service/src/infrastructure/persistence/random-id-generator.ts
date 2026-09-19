import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { IdGenerator } from "../../application/ports";

/** `<prefix>_<uuid>` ids: unguessable, so an id in a log line or admin URL reveals nothing about volume. */
@Injectable()
export class RandomIdGenerator extends IdGenerator {
  next(prefix: string): string {
    return `${prefix}_${randomUUID().replace(/-/g, "")}`;
  }
}
