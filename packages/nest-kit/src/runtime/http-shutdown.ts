import type { Server } from "node:http";
import { createLogger } from "../core/logger";

const IDLE_SWEEP_MS = 100;
const log = createLogger("Lifecycle");

/**
 * Stops accepting connections and resolves once every in-flight request has finished. Idle keep-alive sockets are
 * closed as soon as they become idle; after `graceMs` the remaining sockets are destroyed so shutdown stays bounded.
 */
export function closeHttpServer(server: Server, graceMs: number): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve) => {
    let sweep: NodeJS.Timeout | undefined;
    let deadline: NodeJS.Timeout | undefined;
    const done = () => {
      clearInterval(sweep);
      clearTimeout(deadline);
      resolve();
    };
    server.close((error) => {
      if (error) log.warn("http server close reported an error", { error: error.message });
      done();
    });
    server.closeIdleConnections();
    sweep = setInterval(() => server.closeIdleConnections(), IDLE_SWEEP_MS);
    deadline = setTimeout(() => {
      log.warn("in-flight requests did not finish in time; closing their connections", { graceMs });
      server.closeAllConnections();
    }, graceMs);
  });
}
