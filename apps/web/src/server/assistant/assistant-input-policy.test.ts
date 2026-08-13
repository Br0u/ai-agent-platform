import { describe, expect, it, vi } from "vitest";

import {
  AssistantInputPolicyConflictError,
  AssistantInputPolicyStorageError,
  createAssistantInputPolicyRepository,
} from "./assistant-input-policy";

function fakeDatabase(
  options: {
    selected?: unknown[];
    insertRows?: unknown[];
    updateRows?: unknown[];
    auditError?: Error;
    transactionError?: Error;
  } = {},
) {
  const selectWhere = vi.fn(async () => options.selected ?? []);
  const select = vi.fn(() => ({ from: vi.fn(() => ({ where: selectWhere })) }));
  const insertReturning = vi.fn(async () => options.insertRows ?? []);
  const insertValues = vi.fn(() => ({
    onConflictDoNothing: vi.fn(() => ({ returning: insertReturning })),
    then: (resolve: (value: unknown) => unknown) =>
      resolve(
        options.auditError ? Promise.reject(options.auditError) : undefined,
      ),
  }));
  const insert = vi.fn(() => ({ values: insertValues }));
  const updateReturning = vi.fn(async () => options.updateRows ?? []);
  const updateSet = vi.fn(() => ({
    where: vi.fn(() => ({ returning: updateReturning })),
  }));
  const update = vi.fn(() => ({ set: updateSet }));
  const transaction = vi.fn(async (callback: (tx: unknown) => unknown) => {
    if (options.transactionError) throw options.transactionError;
    return callback({ insert, update });
  });
  return {
    database: { select, transaction },
    select,
    insert,
    update,
    transaction,
    insertValues,
    insertReturning,
    updateReturning,
  };
}

const actor = {
  realm: "workforce" as const,
  userId: "00000000-0000-4000-8000-000000000901",
};

describe("assistant input policy repository", () => {
  it("returns the absent singleton default", async () => {
    const fake = fakeDatabase();
    await expect(
      createAssistantInputPolicyRepository(fake.database as never).load(),
    ).resolves.toEqual({
      terms: [],
      revision: 0,
      updatedAt: null,
      updatedBy: null,
    });
  });

  it("creates then updates with the expected revision and records safe audit metadata", async () => {
    const created = fakeDatabase({
      insertRows: [
        {
          terms: ["foo"],
          revision: 1,
          updatedAt: new Date("2026-08-12T00:00:00.000Z"),
          updatedBy: actor.userId,
        },
      ],
    });
    const repository = createAssistantInputPolicyRepository(
      created.database as never,
    );
    await expect(
      repository.save({
        terms: ["foo"],
        expectedRevision: 0,
        actor,
        requestId: "request-1",
      }),
    ).resolves.toEqual({
      terms: ["foo"],
      revision: 1,
      updatedAt: "2026-08-12T00:00:00.000Z",
      updatedBy: actor.userId,
    });
    expect(created.transaction).toHaveBeenCalledOnce();
    expect(created.insert).toHaveBeenCalledTimes(2);
    expect((created.insertValues.mock.calls as unknown[][])[1]?.[0]).toEqual({
      actorRealm: "workforce",
      actorUserId: actor.userId,
      action: "assistant.input_policy_updated",
      targetType: "assistant_input_policy",
      targetId: "1",
      metadata: { revision: 1, termCount: 1, requestId: "request-1" },
      ipAddress: null,
      userAgent: null,
    });
    expect(
      (created.insertValues.mock.calls as unknown[][])[1]?.[0],
    ).not.toHaveProperty("terms");

    const updated = fakeDatabase({
      updateRows: [
        {
          terms: ["bar"],
          revision: 2,
          updatedAt: new Date("2026-08-12T00:00:01.000Z"),
          updatedBy: actor.userId,
        },
      ],
    });
    await expect(
      createAssistantInputPolicyRepository(updated.database as never).save({
        terms: ["bar"],
        expectedRevision: 1,
        actor,
        requestId: "request-2",
        ipAddress: "203.0.113.10",
        userAgent: "test-agent",
      }),
    ).resolves.toMatchObject({ terms: ["bar"], revision: 2 });
    expect(updated.update).toHaveBeenCalledOnce();
    expect(updated.insert).toHaveBeenCalledTimes(1);
    expect((updated.insertValues.mock.calls as unknown[][])[0]?.[0]).toEqual({
      actorRealm: "workforce",
      actorUserId: actor.userId,
      action: "assistant.input_policy_updated",
      targetType: "assistant_input_policy",
      targetId: "1",
      metadata: { revision: 2, termCount: 1, requestId: "request-2" },
      ipAddress: "203.0.113.10",
      userAgent: "test-agent",
    });
  });

  it("maps stale writes to a stable conflict and infrastructure failures to storage errors", async () => {
    await expect(
      createAssistantInputPolicyRepository(
        fakeDatabase().database as never,
      ).save({ terms: [], expectedRevision: 0, actor, requestId: "request-3" }),
    ).rejects.toBeInstanceOf(AssistantInputPolicyConflictError);

    await expect(
      createAssistantInputPolicyRepository(
        fakeDatabase({ transactionError: new Error("database unavailable") })
          .database as never,
      ).save({ terms: [], expectedRevision: 0, actor, requestId: "request-4" }),
    ).rejects.toBeInstanceOf(AssistantInputPolicyStorageError);
  });

  it("maps load failures to storage errors", async () => {
    const database = {
      select: vi.fn(() => {
        throw new Error("database unavailable");
      }),
    };
    await expect(
      createAssistantInputPolicyRepository(database as never).load(),
    ).rejects.toBeInstanceOf(AssistantInputPolicyStorageError);
  });
});
