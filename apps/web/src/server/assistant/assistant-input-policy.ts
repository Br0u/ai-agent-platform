import "server-only";

import { and, eq } from "drizzle-orm";

import { assistantInputPolicy, getDatabase } from "@ai-agent-platform/database";

import {
  createAuditWriter,
  createDatabaseAuditRepository,
} from "../auth/audit";

type Database = ReturnType<typeof getDatabase>;
type PolicyRow = typeof assistantInputPolicy.$inferSelect;

export type AssistantInputPolicySnapshot = {
  terms: string[];
  revision: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

export class AssistantInputPolicyConflictError extends Error {
  readonly code = "ASSISTANT_INPUT_POLICY_CONFLICT";

  constructor() {
    super("Assistant input policy revision conflict");
    this.name = "AssistantInputPolicyConflictError";
  }
}

export class AssistantInputPolicyStorageError extends Error {
  readonly code = "ASSISTANT_INPUT_POLICY_STORAGE_UNAVAILABLE";

  constructor() {
    super("Assistant input policy storage unavailable");
    this.name = "AssistantInputPolicyStorageError";
  }
}

function snapshot(row: PolicyRow): AssistantInputPolicySnapshot {
  return {
    terms: row.terms,
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

export function createAssistantInputPolicyRepository(
  database: Database = getDatabase(),
) {
  return {
    async load(): Promise<AssistantInputPolicySnapshot> {
      try {
        const rows = await database
          .select()
          .from(assistantInputPolicy)
          .where(eq(assistantInputPolicy.id, 1));
        const row = rows[0];
        return row
          ? snapshot(row)
          : { terms: [], revision: 0, updatedAt: null, updatedBy: null };
      } catch {
        throw new AssistantInputPolicyStorageError();
      }
    },

    async save(input: {
      terms: string[];
      expectedRevision: number;
      actor: { realm: "workforce"; userId: string };
      requestId: string;
      ipAddress?: string;
      userAgent?: string;
    }): Promise<AssistantInputPolicySnapshot> {
      try {
        return await database.transaction(async (databaseTx) => {
          const row =
            input.expectedRevision === 0
              ? (
                  await databaseTx
                    .insert(assistantInputPolicy)
                    .values({
                      id: 1,
                      terms: input.terms,
                      revision: 1,
                      updatedBy: input.actor.userId,
                    })
                    .onConflictDoNothing({ target: assistantInputPolicy.id })
                    .returning()
                )[0]
              : (
                  await databaseTx
                    .update(assistantInputPolicy)
                    .set({
                      terms: input.terms,
                      revision: input.expectedRevision + 1,
                      updatedBy: input.actor.userId,
                      updatedAt: new Date(),
                    })
                    .where(
                      and(
                        eq(assistantInputPolicy.id, 1),
                        eq(
                          assistantInputPolicy.revision,
                          input.expectedRevision,
                        ),
                      ),
                    )
                    .returning()
                )[0];
          if (!row) throw new AssistantInputPolicyConflictError();

          await createAuditWriter(
            createDatabaseAuditRepository(databaseTx),
          ).write({
            event: "assistant.input_policy_updated",
            actor: input.actor,
            target: { type: "assistant_input_policy", id: "1" },
            metadata: {
              revision: row.revision,
              termCount: row.terms.length,
              requestId: input.requestId,
            },
            ...(input.ipAddress === undefined
              ? {}
              : { ipAddress: input.ipAddress }),
            ...(input.userAgent === undefined
              ? {}
              : { userAgent: input.userAgent }),
          });
          return snapshot(row);
        });
      } catch (error) {
        if (error instanceof AssistantInputPolicyConflictError) throw error;
        throw new AssistantInputPolicyStorageError();
      }
    },
  };
}
