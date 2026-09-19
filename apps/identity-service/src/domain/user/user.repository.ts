import type { Email } from "@meridian/kernel";
import type { User } from "./user";

/**
 * Persistence port for the User aggregate. Inside a unit of work, loads lock the aggregate row so concurrent
 * commands on the same account serialise (address limits, default address, verification, deletion).
 */
export abstract class UserRepository {
  abstract findById(id: string): Promise<User | null>;
  abstract findByEmail(email: Email): Promise<User | null>;
  /** Inserts a new user; throws ConflictError when the email is already registered. */
  abstract add(user: User): Promise<void>;
  /** Persists the aggregate's current state including its addresses. */
  abstract save(user: User): Promise<void>;
  /** Erases the account with its addresses, sessions and one-time tokens. */
  abstract remove(user: User): Promise<void>;
}
