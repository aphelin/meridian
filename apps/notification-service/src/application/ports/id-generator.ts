/** Generates aggregate ids (injectable so tests get predictable ids). */
export abstract class IdGenerator {
  abstract next(prefix: string): string;
}
