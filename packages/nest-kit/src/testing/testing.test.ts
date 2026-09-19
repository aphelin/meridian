import { JwtService } from "@nestjs/jwt";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTestJwt, startBlackholeServer, waitFor } from "./helpers";

afterEach(() => vi.unstubAllEnvs());

describe("testing helpers", () => {
  it("makeTestJwt signs tokens the kit JwtService accepts", async () => {
    vi.stubEnv("JWT_SECRET", "testing-helper-secret-0123456789abcdef");
    const token = makeTestJwt("admin", "admin-1");
    const claims = await new JwtService({ secret: "testing-helper-secret-0123456789abcdef" }).verifyAsync(token, { algorithms: ["HS256"] });
    expect(claims).toMatchObject({ sub: "admin-1", role: "admin" });
  });

  it("startBlackholeServer accepts connections and never answers, producing a client timeout", async () => {
    const hole = await startBlackholeServer();
    try {
      await expect(fetch(hole.url, { signal: AbortSignal.timeout(100) })).rejects.toMatchObject({ name: "TimeoutError" });
    } finally {
      await hole.close();
    }
  });

  it("waitFor resolves with the first truthy value and times out otherwise", async () => {
    let n = 0;
    await expect(waitFor(() => ++n >= 3 && n, 1000, 5)).resolves.toBe(3);
    await expect(waitFor(() => false, 50, 10)).rejects.toThrow(/timed out/);
  });
});
