import type { AddressInput, EventPayloads } from "@meridian/contracts";
import { AggregateRoot, ConflictError, type DomainEvent, Email, NotFoundError, ValidationError } from "@meridian/kernel";
import { Address, type AddressDetails, type AddressState, parseAddressDetails } from "./address";
import type { Role } from "./role";
import { UserName } from "./user-name";

export type UserEventName = "UserRegistered" | "UserEmailVerified" | "UserProfileUpdated" | "UserDeleted";
export type UserEvent = { [N in UserEventName]: DomainEvent<N, EventPayloads[N]> }[UserEventName];

export const USER_AGGREGATE = "User";

export interface UserState {
  id: string;
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  addresses: AddressState[];
}

export type AddressChange = Partial<Omit<AddressInput, "isDefault">> & { isDefault?: boolean };

/**
 * The account aggregate. It owns the credentials hash, the email verification state and the saved addresses, and
 * enforces: normalised unique-able email, at most 10 addresses, at most one default address, verification only once,
 * and that a deleted account accepts no further changes.
 */
export class User extends AggregateRoot<UserEvent> {
  static readonly MAX_ADDRESSES = 10;

  private readonly addressList: Address[];
  private deleted = false;

  private constructor(
    private state: Omit<UserState, "addresses">,
    addresses: Address[],
  ) {
    super();
    this.addressList = addresses;
  }

  static register(input: { id: string; email: Email; name: UserName; passwordHash: string; role?: Role; now: Date }): User {
    if (!input.passwordHash) throw new ValidationError("A password hash is required.");
    const user = new User(
      {
        id: input.id,
        email: input.email.value,
        name: input.name.value,
        role: input.role ?? "customer",
        passwordHash: input.passwordHash,
        emailVerifiedAt: null,
        createdAt: input.now,
      },
      [],
    );
    user.emit("UserRegistered", { userId: user.id, email: user.email, name: user.name }, input.now);
    return user;
  }

  static rehydrate(state: UserState): User {
    const { addresses, ...rest } = state;
    return new User({ ...rest }, addresses.map((address) => Address.rehydrate(address)));
  }

  get id() {
    return this.state.id;
  }
  get email() {
    return this.state.email;
  }
  get name() {
    return this.state.name;
  }
  get role() {
    return this.state.role;
  }
  get passwordHash() {
    return this.state.passwordHash;
  }
  get emailVerified() {
    return this.state.emailVerifiedAt !== null;
  }
  get emailVerifiedAt() {
    return this.state.emailVerifiedAt;
  }
  get createdAt() {
    return this.state.createdAt;
  }
  get isDeleted() {
    return this.deleted;
  }
  get addresses(): readonly Address[] {
    return [...this.addressList];
  }

  /** Marks the email as verified. Returns false (and raises nothing) when it already was. */
  verifyEmail(now: Date): boolean {
    this.assertActive();
    if (this.state.emailVerifiedAt) return false;
    this.state.emailVerifiedAt = now;
    this.emit("UserEmailVerified", { userId: this.id, email: this.email }, now);
    return true;
  }

  /** Changes the display name. Returns false when the name is unchanged. */
  rename(name: UserName, now: Date): boolean {
    this.assertActive();
    if (name.value === this.state.name) return false;
    this.state.name = name.value;
    this.emit("UserProfileUpdated", { userId: this.id, name: this.name }, now);
    return true;
  }

  /** Replaces the credential hash. Verifying the old password is the caller's job (hashing is infrastructure). */
  changePasswordHash(passwordHash: string): void {
    this.assertActive();
    if (!passwordHash) throw new ValidationError("A password hash is required.");
    this.state.passwordHash = passwordHash;
  }

  promoteToAdmin(): boolean {
    this.assertActive();
    if (this.state.role === "admin") return false;
    this.state.role = "admin";
    return true;
  }

  address(id: string): Address {
    const found = this.addressList.find((address) => address.id === id);
    if (!found) throw new NotFoundError("Address not found.");
    return found;
  }

  /** Adds an address. The first address becomes the default; `isDefault` moves the default to the new one. */
  addAddress(id: string, input: AddressInput, now: Date): Address {
    this.assertActive();
    if (this.addressList.length >= User.MAX_ADDRESSES) {
      throw new ConflictError(`You can save at most ${User.MAX_ADDRESSES} addresses.`, { max: User.MAX_ADDRESSES });
    }
    if (this.addressList.some((address) => address.id === id)) throw new ConflictError("Address already exists.");
    const address = Address.create(id, parseAddressDetails(input), now);
    this.addressList.push(address);
    if (input.isDefault === true || this.addressList.length === 1) this.makeDefault(address);
    return address;
  }

  /** Applies a partial change. `isDefault: true` moves the default here; `false` clears it on this address. */
  updateAddress(id: string, change: AddressChange): Address {
    this.assertActive();
    const address = this.address(id);
    const { isDefault, ...fields } = change;
    const merged: AddressDetails = { ...address.details };
    for (const [key, value] of Object.entries(fields) as [keyof AddressDetails, unknown][]) {
      if (value !== undefined) (merged as unknown as Record<string, unknown>)[key] = value;
    }
    address.replaceDetails(parseAddressDetails(merged));
    if (isDefault === true) this.makeDefault(address);
    else if (isDefault === false) address.setDefault(false);
    return address;
  }

  /** Removes an address; when it was the default, the oldest remaining address becomes the default. */
  removeAddress(id: string): void {
    this.assertActive();
    const address = this.address(id);
    this.addressList.splice(this.addressList.indexOf(address), 1);
    if (address.isDefault && this.addressList.length) this.makeDefault(this.addressList[0]);
  }

  /** Closes the account. The repository then erases the user, its sessions, tokens and addresses. */
  delete(now: Date): void {
    this.assertActive();
    this.deleted = true;
    this.emit("UserDeleted", { userId: this.id, email: this.email }, now);
  }

  snapshot(): UserState {
    return { ...this.state, addresses: this.addressList.map((address) => address.snapshot()) };
  }

  private makeDefault(target: Address) {
    for (const address of this.addressList) address.setDefault(address === target);
  }

  private assertActive() {
    if (this.deleted) throw new ConflictError("This account has been deleted.");
  }

  private emit<N extends UserEventName>(name: N, payload: EventPayloads[N], now: Date) {
    this.raise({ name, aggregateType: USER_AGGREGATE, aggregateId: this.id, payload, occurredAt: now } as UserEvent);
  }
}
