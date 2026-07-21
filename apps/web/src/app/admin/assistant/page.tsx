import { loadAdminAssistantSessions } from "@/app/api/v1/admin/assistant/sessions/handler";
import { loadAdminAssistantStatus } from "@/app/api/v1/admin/assistant/status/handler";
import { loadAdminModelConfigSnapshot } from "@/app/api/v1/admin/assistant/model-configs/handler";
import { createAdminSkillListHandler } from "@/app/api/v1/admin/assistant/skills/handler";
import { AssistantAdminPage } from "@/components/admin/assistant-admin-page";
import type { AdminSkillRegistrySnapshot } from "@/components/admin/assistant-skill-registry-panel";
import { metadataForRegisteredRoute } from "@/components/route-scaffold/registered-route-page";
import type {
  AdminAssistantSessionsSnapshot,
  AdminAssistantStatusSnapshot,
} from "@/features/assistant/admin-assistant-contract";
import {
  ADMIN_MODEL_PROVIDERS,
  type AdminModelConfigSnapshot,
  type AdminModelProvider,
} from "@/features/assistant/admin-model-config-contract";
import {
  parseAdminSkillListResponse,
  parseAdminSkillPermissionFlags,
  type AdminSkillPermissionFlags,
} from "@/features/assistant/admin-skill-contract";
import { requirePermission, type WorkforceActor } from "@/server/auth/access";

const pathname = "/admin/assistant";
const modelProviderNames: Readonly<Record<AdminModelProvider, string>> = {
  openai: "OpenAI",
  anthropic: "Claude",
  google: "Gemini",
  dashscope: "Qwen / DashScope",
  deepseek: "DeepSeek",
  minimax: "MiniMax",
};

function unavailableModelConfigSnapshot(
  permissions: readonly string[],
): AdminModelConfigSnapshot {
  return {
    version: "1",
    configs: ADMIN_MODEL_PROVIDERS.map((provider) => ({
      provider,
      displayName: modelProviderNames[provider],
      modelId: null,
      endpointId: null,
      revision: null,
      testStatus: "not_configured",
      lastTestedAt: null,
      apiKey: null,
      activeRevision: null,
    })),
    endpoints: {
      openai: [],
      anthropic: [],
      google: [],
      dashscope: [],
      deepseek: [],
      minimax: [],
    },
    runtime: {
      capability: "degraded",
      source: null,
      provider: null,
      modelId: null,
      configRevision: null,
      activationVersion: null,
    },
    canConfigure: permissions.includes("admin:assistant:configure"),
    canReveal: permissions.includes("admin:assistant:secret:reveal"),
    controlEnabled: false,
  };
}

type LoadedSkillSnapshot = {
  snapshot: AdminSkillRegistrySnapshot;
  permissions: AdminSkillPermissionFlags;
};

function actorSkillPermissions(
  actor: WorkforceActor,
): AdminSkillPermissionFlags {
  const canRead = actor.permissions.includes("admin:assistant:skills");
  return {
    canUpload:
      canRead && actor.permissions.includes("admin:assistant:skills:upload"),
    canManageConnections:
      canRead &&
      actor.permissions.includes("admin:assistant:skills:connections"),
    canReview:
      canRead && actor.permissions.includes("admin:assistant:skills:review"),
    canConfigure:
      canRead && actor.permissions.includes("admin:assistant:skills:configure"),
  };
}

function unavailableSkillSnapshot(actor: WorkforceActor): LoadedSkillSnapshot {
  return {
    snapshot: { capability: "degraded", skills: [] },
    permissions: actorSkillPermissions(actor),
  };
}

function parseSkillListEnvelope(value: unknown): LoadedSkillSnapshot | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    if (Reflect.getPrototypeOf(value) !== Object.prototype) return null;
    const keys = [
      "version",
      "skills",
      "page",
      "requestId",
      "permissions",
    ] as const;
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== keys.length ||
      ownKeys.some(
        (key) => typeof key !== "string" || !keys.includes(key as never),
      )
    ) {
      return null;
    }
    const record: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) return null;
      record[key] = descriptor.value;
    }
    if (
      typeof record.requestId !== "string" ||
      record.requestId.length < 1 ||
      record.requestId.length > 128
    ) {
      return null;
    }
    const list = parseAdminSkillListResponse({
      version: record.version,
      skills: record.skills,
      page: record.page,
    });
    const permissions = parseAdminSkillPermissionFlags(record.permissions);
    if (list === null || permissions === null) return null;
    return {
      snapshot: {
        capability: "available",
        skills: list.skills,
        page: list.page,
      },
      permissions,
    };
  } catch {
    return null;
  }
}

async function loadAdminSkillSnapshot(
  actor: WorkforceActor,
): Promise<LoadedSkillSnapshot> {
  if (!actor.permissions.includes("admin:assistant:skills")) {
    return unavailableSkillSnapshot(actor);
  }
  const handler = createAdminSkillListHandler({
    access: {
      requirePermission: async () => actor,
    },
  });
  const response = await handler(
    new Request(
      "http://skill-registry.internal/api/v1/admin/assistant/skills?limit=25&offset=0",
    ),
  );
  if (!response.ok) throw new Error("Skill Registry snapshot unavailable");
  const parsed = parseSkillListEnvelope(await response.json());
  if (parsed === null) throw new Error("Invalid Skill Registry snapshot");
  return parsed;
}

export const metadata = metadataForRegisteredRoute(pathname);

export default async function AdminAssistantPage() {
  const actor = await requirePermission("admin:assistant");
  const [status, sessions, modelConfigs, skillRegistry]: [
    AdminAssistantStatusSnapshot,
    AdminAssistantSessionsSnapshot,
    AdminModelConfigSnapshot,
    LoadedSkillSnapshot,
  ] = await Promise.all([
    loadAdminAssistantStatus(),
    loadAdminAssistantSessions(),
    loadAdminModelConfigSnapshot(actor).catch(() =>
      unavailableModelConfigSnapshot(actor.permissions),
    ),
    loadAdminSkillSnapshot(actor).catch(() => unavailableSkillSnapshot(actor)),
  ]);

  return (
    <main>
      <AssistantAdminPage
        modelConfigs={modelConfigs}
        sessions={sessions}
        skillActorUserId={actor.userId}
        skillCanRead={actor.permissions.includes("admin:assistant:skills")}
        skillPermissions={skillRegistry.permissions}
        skillSnapshot={skillRegistry.snapshot}
        status={status}
      />
    </main>
  );
}
