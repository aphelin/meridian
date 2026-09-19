import { requiredText } from "../shared/text";

/** A person's display name: trimmed, 1–100 characters. */
export class UserName {
  static readonly MAX = 100;
  private constructor(readonly value: string) {}

  static parse(input: unknown): UserName {
    return new UserName(requiredText(input, "Name", UserName.MAX));
  }

  equals(other: UserName): boolean {
    return other.value === this.value;
  }

  toString() {
    return this.value;
  }
}
