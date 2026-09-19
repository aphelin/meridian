import type { AddressInput, AddressDto, CustomerListDto, UserDto } from "@meridian/contracts";
import { ConflictError, type Email, FixedClock } from "@meridian/kernel";
import {
  OneTimeToken,
  type OneTimeTokenState,
  OneTimeTokenRepository,
  RefreshToken,
  type RefreshTokenState,
  RefreshTokenRepository,
  type Role,
  type TokenPurpose,
  User,
  UserRepository,
  type UserState,
} from "../../domain";
import { CustomerCursorCodec } from "../queries/customer-cursor";
import {
  AccessTokenIssuer,
  type CustomerListCriteria,
  IdentityReadModel,
  IdentitySettings,
  MessageOutbox,
  type OutboundEvent,
  PasswordHasher,
  type SendEmailPayload,
  type TransactionScope,
  UnitOfWork,
} from "../ports";
import { AccountEmails } from "../services/account-emails";
import { SessionIssuer } from "../services/session-issuer";

/** Test double for the identity database: aggregates are stored as snapshots, so no object is shared by reference. */
export class InMemoryStore {
  users = new Map<string, UserState>();
  tokens = new Map<string, OneTimeTokenState>();
  sessions = new Map<string, RefreshTokenState>();
  outbox: Array<{ kind: "event"; name: string; aggregateId: string; payload: unknown } | { kind: "command"; name: "notification.send-email"; payload: SendEmailPayload }> = [];

  clone() {
    return {
      users: structuredClone(this.users),
      tokens: structuredClone(this.tokens),
      sessions: structuredClone(this.sessions),
      outbox: structuredClone(this.outbox),
    };
  }

  restore(snapshot: ReturnType<InMemoryStore["clone"]>) {
    Object.assign(this, snapshot);
  }

  events(name?: string) {
    return this.outbox.flatMap((row) => (row.kind === "event" && (!name || row.name === name) ? [row] : []));
  }

  emails(template?: string) {
    return this.outbox.flatMap((row) => (row.kind === "command" && (!template || row.payload.template === template) ? [row.payload] : []));
  }
}

export class InMemoryUserRepository extends UserRepository {
  constructor(private readonly store: InMemoryStore) {
    super();
  }
  async findById(id: string) {
    const state = this.store.users.get(id);
    return state ? User.rehydrate(structuredClone(state)) : null;
  }
  async findByEmail(email: Email) {
    const state = [...this.store.users.values()].find((u) => u.email === email.value);
    return state ? User.rehydrate(structuredClone(state)) : null;
  }
  async add(user: User) {
    if ([...this.store.users.values()].some((u) => u.email === user.email)) throw new ConflictError("An account with this email already exists.");
    this.store.users.set(user.id, user.snapshot());
  }
  async save(user: User) {
    if (!this.store.users.has(user.id)) throw new Error("save of unknown user");
    this.store.users.set(user.id, user.snapshot());
  }
  async remove(user: User) {
    this.store.users.delete(user.id);
    for (const [id, token] of this.store.tokens) if (token.userId === user.id) this.store.tokens.delete(id);
    for (const [id, session] of this.store.sessions) if (session.userId === user.id) this.store.sessions.delete(id);
  }
}

export class InMemoryOneTimeTokenRepository extends OneTimeTokenRepository {
  constructor(private readonly store: InMemoryStore) {
    super();
  }
  async findByHash(hash: string) {
    const state = [...this.store.tokens.values()].find((t) => t.tokenHash === hash);
    return state ? OneTimeToken.rehydrate(structuredClone(state)) : null;
  }
  async add(token: OneTimeToken) {
    this.store.tokens.set(token.id, token.snapshot());
  }
  async markUsed(token: OneTimeToken) {
    const stored = this.store.tokens.get(token.id);
    if (!stored || stored.usedAt) return false;
    stored.usedAt = token.usedAt;
    return true;
  }
  async invalidateOutstanding(userId: string, purpose: TokenPurpose, now: Date) {
    let count = 0;
    for (const token of this.store.tokens.values()) {
      if (token.userId === userId && token.purpose === purpose && !token.usedAt) {
        token.usedAt = now;
        count++;
      }
    }
    return count;
  }
}

export class InMemoryRefreshTokenRepository extends RefreshTokenRepository {
  constructor(private readonly store: InMemoryStore) {
    super();
  }
  async findByHash(hash: string) {
    const state = [...this.store.sessions.values()].find((t) => t.tokenHash === hash);
    return state ? RefreshToken.rehydrate(structuredClone(state)) : null;
  }
  async add(token: RefreshToken) {
    this.store.sessions.set(token.id, token.snapshot());
  }
  async revokeIfActive(id: string, now: Date) {
    const token = this.store.sessions.get(id);
    if (!token || token.revokedAt) return false;
    token.revokedAt = now;
    return true;
  }
  async revokeFamily(familyId: string, now: Date) {
    return this.revokeWhere((t) => t.familyId === familyId, now);
  }
  async revokeAllForUser(userId: string, now: Date, keepFamilyId?: string | null) {
    return this.revokeWhere((t) => t.userId === userId && t.familyId !== keepFamilyId, now);
  }
  private revokeWhere(match: (t: RefreshTokenState) => boolean, now: Date) {
    let count = 0;
    for (const token of this.store.sessions.values()) {
      if (!token.revokedAt && match(token)) {
        token.revokedAt = now;
        count++;
      }
    }
    return count;
  }
  active(userId: string) {
    return [...this.store.sessions.values()].filter((t) => t.userId === userId && !t.revokedAt);
  }
}

export class InMemoryOutbox extends MessageOutbox {
  constructor(private readonly store: InMemoryStore) {
    super();
  }
  async publish(events: readonly OutboundEvent[]) {
    for (const e of events) this.store.outbox.push({ kind: "event", name: e.name, aggregateId: e.aggregateId, payload: e.payload });
  }
  async sendEmail(payload: SendEmailPayload) {
    this.store.outbox.push({ kind: "command", name: "notification.send-email", payload: structuredClone(payload) });
  }
}

/** Transactional fake: any error thrown by the work restores the store as it was before `run`. */
export class InMemoryUnitOfWork extends UnitOfWork {
  runs = 0;
  constructor(private readonly store: InMemoryStore) {
    super();
  }
  async run<T>(work: (scope: TransactionScope) => Promise<T>): Promise<T> {
    this.runs++;
    const before = this.store.clone();
    try {
      return await work({
        users: new InMemoryUserRepository(this.store),
        tokens: new InMemoryOneTimeTokenRepository(this.store),
        sessions: new InMemoryRefreshTokenRepository(this.store),
        outbox: new InMemoryOutbox(this.store),
      });
    } catch (error) {
      this.store.restore(before);
      throw error;
    }
  }
}

export class FakePasswordHasher extends PasswordHasher {
  decoyChecks = 0;
  verifications = 0;
  async hash(plain: string) {
    return `hashed:${plain}`;
  }
  async verify(hash: string, plain: string) {
    this.verifications++;
    return hash === `hashed:${plain}`;
  }
  async verifyDecoy(): Promise<false> {
    this.decoyChecks++;
    return false;
  }
}

export class FakeAccessTokenIssuer extends AccessTokenIssuer {
  async issue(subject: { id: string; role: Role }) {
    return `access:${subject.id}:${subject.role}`;
  }
}

export class StaticSettings extends IdentitySettings {
  readonly publicSiteUrl = "https://shop.example";
  readonly refreshTokenTtlMs = 30 * 24 * 60 * 60 * 1000;
  admin: { email: string; password: string } | null = { email: "Admin@Example.com", password: "admin-password-1" };
}

export class InMemoryReadModel extends IdentityReadModel {
  constructor(private readonly store: InMemoryStore) {
    super();
  }
  private dto(state: UserState): UserDto {
    return { id: state.id, email: state.email, name: state.name, role: state.role, emailVerified: !!state.emailVerifiedAt, createdAt: state.createdAt.toISOString() };
  }
  async userById(id: string) {
    const state = this.store.users.get(id);
    return state ? this.dto(state) : null;
  }
  async addressesOf(userId: string): Promise<AddressDto[] | null> {
    const state = this.store.users.get(userId);
    return state ? state.addresses.map(({ createdAt: _c, ...a }) => a) : null;
  }
  async customers({ q, cursor, limit }: CustomerListCriteria): Promise<CustomerListDto> {
    const after = cursor ? CustomerCursorCodec.decode(cursor) : null;
    const rows = [...this.store.users.values()]
      .filter((u) => u.role === "customer")
      .filter((u) => !q || u.email.includes(q.toLowerCase()) || u.name.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
      .filter((u) => !after || u.createdAt < after.createdAt || (u.createdAt.getTime() === after.createdAt.getTime() && u.id < after.id));
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return { items: page.map((u) => this.dto(u)), nextCursor: rows.length > limit && last ? CustomerCursorCodec.encode(last) : null };
  }
}

/** Wires every fake the handlers need. */
export function identityHarness(start = new Date("2026-09-17T10:00:00.000Z")) {
  const store = new InMemoryStore();
  const clock = new FixedClock(start);
  const uow = new InMemoryUnitOfWork(store);
  const hasher = new FakePasswordHasher();
  const settings = new StaticSettings();
  const emails = new AccountEmails(settings);
  const sessions = new SessionIssuer(new FakeAccessTokenIssuer(), settings, clock);
  return {
    store,
    clock,
    uow,
    hasher,
    settings,
    emails,
    sessions,
    users: new InMemoryUserRepository(store),
    tokens: new InMemoryOneTimeTokenRepository(store),
    refreshTokens: new InMemoryRefreshTokenRepository(store),
    readModel: new InMemoryReadModel(store),
  };
}

export const tokenFromUrl = (url: unknown) => new URL(String(url)).searchParams.get("token") ?? "";

export const sampleAddress = (over: Partial<AddressInput> = {}): AddressInput => ({
  fullName: "Nino Beridze",
  line1: "1 Rustaveli Ave",
  line2: null,
  city: "Tbilisi",
  postalCode: "0105",
  country: "GE",
  phone: null,
  ...over,
});
