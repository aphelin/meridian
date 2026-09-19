import { createHmac } from "node:crypto";
import net from "node:net";
import { jwtSecret } from "../auth/secrets";


/** HS256 token signed with the current JWT secret policy, valid for `ttlSec` (default 10 minutes). */
export function makeTestJwt(role: string, sub = `test-${role}`, options: { email?: string; ttlSec?: number; secret?: string } = {}): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const claims = encode({ sub, role, ...(options.email ? { email: options.email } : {}), iat: now, exp: now + (options.ttlSec ?? 600) });
  const signature = createHmac("sha256", options.secret ?? jwtSecret()).update(`${header}.${claims}`).digest("base64url");
  return `${header}.${claims}.${signature}`;
}

export interface BlackholeServer {
  url: string;
  port: number;
  close(): Promise<void>;
}

/** TCP server on 127.0.0.1 that accepts connections and never answers: exercises client timeouts and breakers. */
export async function startBlackholeServer(): Promise<BlackholeServer> {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => undefined);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const { port } = server.address() as net.AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

/** Polls `fn` until it returns a truthy value (which is returned) or `timeoutMs` elapses (rejects with the last error). */
export async function waitFor<T>(fn: () => T | Promise<T>, timeoutMs = 5000, intervalMs = 50): Promise<NonNullable<T>> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  for (;;) {
    try {
      const value = await fn();
      if (value) return value as NonNullable<T>;
    } catch (error) {
      lastError = error;
    }
    if (Date.now() >= deadline) {
      const suffix = lastError instanceof Error ? `: ${lastError.message}` : "";
      throw new Error(`waitFor timed out after ${timeoutMs}ms${suffix}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
