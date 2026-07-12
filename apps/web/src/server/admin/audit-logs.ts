import "server-only";

import { and, count, desc, eq, gte, ilike, lte, or } from "drizzle-orm";

import { auditLogs, getDatabase } from "@ai-agent-platform/database";

import type { WorkforceActor } from "../auth/access";

export type AuditLogQuery = {
  actor?: string;
  action?: string;
  target?: string;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
};
type AuditLogRow = {
  id: string;
  actorRealm: "customer" | "workforce" | null;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};
export type AuditLogQueryRepository = {
  search(
    query: AuditLogQuery,
  ): Promise<{ items: AuditLogRow[]; total: number }>;
};

const SENSITIVE_METADATA_KEY =
  /password|token|secret|code|credential|cookie|authorization|email|ipaddress|useragent/i;
function redactMetadata(value: Record<string, unknown> | null) {
  if (!value) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, item]) =>
        !SENSITIVE_METADATA_KEY.test(key) &&
        (item === null ||
          ["string", "number", "boolean"].includes(typeof item)),
    ),
  ) as Record<string, string | number | boolean | null>;
}

export function createAuditLogQueryService(
  repository: AuditLogQueryRepository,
) {
  return {
    async list(actor: WorkforceActor, query: AuditLogQuery) {
      if (!actor.permissions.includes("admin:audit"))
        throw Object.assign(new Error("AUTH_PERMISSION_DENIED"), {
          code: "AUTH_PERMISSION_DENIED",
        });
      const result = await repository.search(query);
      return {
        items: result.items.map((item) => ({
          ...item,
          metadata: redactMetadata(item.metadata),
          createdAt: item.createdAt.toISOString(),
        })),
        total: result.total,
        page: query.page,
        pageSize: query.pageSize,
      };
    },
  };
}

export function createDefaultAuditLogQueryService() {
  const database = getDatabase();
  return createAuditLogQueryService({
    async search(query) {
      const filter = and(
        query.actor ? eq(auditLogs.actorUserId, query.actor) : undefined,
        query.action ? ilike(auditLogs.action, `%${query.action}%`) : undefined,
        query.target
          ? or(
              eq(auditLogs.targetId, query.target),
              ilike(auditLogs.targetType, `%${query.target}%`),
            )
          : undefined,
        query.from ? gte(auditLogs.createdAt, query.from) : undefined,
        query.to ? lte(auditLogs.createdAt, query.to) : undefined,
      );
      const [totalRow] = await database
        .select({ value: count() })
        .from(auditLogs)
        .where(filter);
      const items = await database
        .select({
          id: auditLogs.id,
          actorRealm: auditLogs.actorRealm,
          actorUserId: auditLogs.actorUserId,
          action: auditLogs.action,
          targetType: auditLogs.targetType,
          targetId: auditLogs.targetId,
          metadata: auditLogs.metadata,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .where(filter)
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);
      return { items, total: totalRow?.value ?? 0 };
    },
  });
}
