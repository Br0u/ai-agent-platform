import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  database: { execute: vi.fn() },
  drizzle: vi.fn(),
  poolConstructor: vi.fn(),
}));

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: mocks.drizzle,
}));

vi.mock("pg", () => ({
  Pool: class MockPool {
    constructor(options: unknown) {
      mocks.poolConstructor(options);
    }
  },
}));

let client: typeof import("./client");

beforeEach(async () => {
  vi.resetModules();
  vi.unstubAllEnvs();
  mocks.drizzle.mockReset().mockReturnValue(mocks.database);
  mocks.poolConstructor.mockReset();
  client = await import("./client");
});

describe("database client", () => {
  it("uses bounded PostgreSQL pool and query options", () => {
    const connectionString = "postgres://user:secret@database/platform";

    expect(client.databasePoolOptions(connectionString)).toEqual({
      connectionString,
      max: 10,
      connectionTimeoutMillis: 1_500,
      idleTimeoutMillis: 10_000,
      query_timeout: 2_000,
      statement_timeout: 2_000,
      allowExitOnIdle: false,
    });
  });

  it("keeps DATABASE_URL required without constructing a pool", () => {
    vi.stubEnv("DATABASE_URL", "");

    expect(() => client.getDatabase()).toThrow("DATABASE_URL is required");
    expect(mocks.poolConstructor).not.toHaveBeenCalled();
  });

  it("lazily constructs one pool with the bounded options", () => {
    const connectionString = "postgres://user:secret@database/platform";
    vi.stubEnv("DATABASE_URL", connectionString);

    expect(mocks.poolConstructor).not.toHaveBeenCalled();

    const first = client.getDatabase();
    const second = client.getDatabase();

    expect(first).toBe(second);
    expect(mocks.poolConstructor).toHaveBeenCalledOnce();
    expect(mocks.poolConstructor).toHaveBeenCalledWith(
      client.databasePoolOptions(connectionString),
    );
    expect(mocks.drizzle).toHaveBeenCalledOnce();
  });
});
