import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminModelConfigSnapshot } from "@/features/assistant/admin-model-config-contract";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  loadStatus: vi.fn(),
  loadSessions: vi.fn(),
  loadModelConfigs: vi.fn(),
  loadSkillRuntime: vi.fn(),
  createSkillListHandler: vi.fn(),
  skillListHandler: vi.fn(),
}));

vi.mock("@/server/auth/access", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/app/api/v1/admin/assistant/status/handler", () => ({
  loadAdminAssistantStatus: mocks.loadStatus,
}));
vi.mock("@/app/api/v1/admin/assistant/sessions/handler", () => ({
  loadAdminAssistantSessions: mocks.loadSessions,
}));
vi.mock("@/app/api/v1/admin/assistant/model-configs/handler", () => ({
  loadAdminModelConfigSnapshot: mocks.loadModelConfigs,
}));
vi.mock("@/app/api/v1/admin/assistant/skill-runtime/handler", () => ({
  loadAdminSkillRuntimeSnapshot: mocks.loadSkillRuntime,
}));
vi.mock("@/app/api/v1/admin/assistant/skills/handler", () => ({
  createAdminSkillListHandler: mocks.createSkillListHandler,
}));

import AdminAssistantPage from "./page";

const status = {
  mode: "placeholder" as const,
  runtime: {
    live: true,
    ready: true,
    capability: "placeholder" as const,
    providerMode: "placeholder" as const,
    selectedProvider: "placeholder" as const,
    persistence: "disabled" as const,
    circuits: {
      readiness: { state: "closed" as const, consecutiveFailures: 0 },
      execution: { state: "closed" as const, consecutiveFailures: 0 },
    },
    readiness: {
      cacheTtlMs: 5000,
      probeTimeoutMs: 1500,
      failureThreshold: 3,
    },
    source: "none" as const,
    provider: null,
    modelId: null,
    configRevision: null,
    activationVersion: null,
    testStatus: "not_configured" as const,
  },
  services: [
    {
      id: "agentos",
      label: "AgentOS",
      state: "not_connected",
      detail: "尚未连接",
    },
    {
      id: "database",
      label: "会话数据库",
      state: "not_configured",
      detail: "尚未启用",
    },
    { id: "model", label: "模型", state: "not_configured", detail: "尚未配置" },
    {
      id: "public_entry",
      label: "公开入口",
      state: "placeholder",
      detail: "占位模式可用",
    },
  ],
  configuration: {
    defaultAgent: "码多多（占位）",
    model: "未配置",
    skills: "未接入",
    sessionStorage: "未启用",
  },
  message: "当前仅提供本地占位回复。",
};

const sessions = {
  persistence: "disabled" as const,
  listing: "not_available" as const,
  message: "占位模式未持久化会话；管理列表不可用。",
};

const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  realm: "workforce" as const,
  status: "active" as const,
  displayName: "Admin",
  mustChangePassword: false,
  twoFactorEnabled: true,
  permissions: [
    "admin:assistant",
    "admin:assistant:configure",
    "admin:assistant:skills",
    "admin:assistant:skills:upload",
    "admin:assistant:skills:review",
  ],
};

const skillListResponse = {
  version: "1",
  skills: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      name: "safe-review",
      createdAt: "2026-07-21T08:00:00.000Z",
      revision: {
        id: "44444444-4444-4444-8444-444444444444",
        number: 1,
        state: "pending_review",
        sourceType: "upload",
        artifactSha256Prefix: "aaaaaaaaaaaa",
        createdBy: "11111111-1111-4111-8111-111111111111",
        createdAt: "2026-07-21T08:00:00.000Z",
        reviewedBy: null,
        reviewedAt: null,
      },
    },
  ],
  page: { limit: 25, offset: 0, returned: 1 },
  requestId: "66666666-6666-4666-8666-666666666666",
  permissions: {
    canUpload: true,
    canManageConnections: false,
    canReview: true,
    canConfigure: false,
  },
};

const skillRuntime = {
  version: "1" as const,
  available: { items: [], limit: 100, offset: 0, total: 0 },
  registry: {
    active: null,
    previous: null,
    activationVersion: 0,
    candidateCount: 0,
    candidates: [],
  },
  agent: {
    skillCapability: "unconfigured" as const,
    configured: false,
    activeSetId: null,
    loadedSetId: null,
    previousSetId: null,
    activationVersion: 0,
    failureCode: null,
  },
  permissions: { canRead: true, canConfigure: false },
};

const modelConfigs = {
  version: "1" as const,
  configs: (
    [
      ["openai", "OpenAI"],
      ["anthropic", "Claude"],
      ["google", "Gemini"],
      ["dashscope", "Qwen / DashScope"],
      ["deepseek", "DeepSeek"],
      ["minimax", "MiniMax"],
    ] as const
  ).map(([provider, displayName]) => ({
    provider,
    displayName,
    modelId: null,
    endpointId: null,
    revision: null,
    testStatus: "not_configured" as const,
    lastTestedAt: null,
    apiKey: null,
    activeRevision: null,
  })),
  endpoints: {
    openai: [{ id: "openai-default", label: "OpenAI 官方" }],
    anthropic: [{ id: "anthropic-default", label: "Claude 官方" }],
    google: [{ id: "google-default", label: "Gemini 官方" }],
    dashscope: [{ id: "dashscope-default", label: "Qwen 官方" }],
    deepseek: [{ id: "deepseek-default", label: "DeepSeek 官方" }],
    minimax: [{ id: "minimax-default", label: "MiniMax 官方" }],
  },
  runtime: {
    capability: "placeholder" as const,
    source: null,
    provider: null,
    modelId: null,
    configRevision: null,
    activationVersion: null,
  },
  canConfigure: true,
  canReveal: false,
  controlEnabled: true,
} satisfies AdminModelConfigSnapshot;

const unavailableSessions = {
  persistence: "unavailable" as const,
  listing: "not_available" as const,
  message: "持久化状态不可用；管理列表不可用。",
};

const unavailableStatus = {
  ...status,
  runtime: {
    ...status.runtime,
    live: false,
    ready: false,
    capability: "degraded" as const,
    selectedProvider: "unavailable" as const,
    persistence: "unavailable" as const,
    readiness: {
      cacheTtlMs: 0,
      probeTimeoutMs: 0,
      failureThreshold: 0,
    },
  },
  services: status.services.map((service) =>
    service.id === "public_entry"
      ? { ...service, state: "degraded" as const, detail: "降级模式" }
      : service,
  ),
  configuration: {
    ...status.configuration,
    sessionStorage: "状态不可用",
  },
  message: "助手基础服务暂不可用。",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(cleanup);

describe("AdminAssistantPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue(actor);
    mocks.loadStatus.mockResolvedValue(status);
    mocks.loadSessions.mockResolvedValue(sessions);
    mocks.loadModelConfigs.mockResolvedValue(modelConfigs);
    mocks.loadSkillRuntime.mockResolvedValue(skillRuntime);
    mocks.createSkillListHandler.mockReturnValue(mocks.skillListHandler);
    mocks.skillListHandler.mockResolvedValue(Response.json(skillListResponse));
  });

  it("requires the exact assistant permission before loading protected data", async () => {
    const page = await AdminAssistantPage();
    const serializedProps = JSON.stringify(page);
    render(page);

    expect(mocks.requirePermission).toHaveBeenCalledExactlyOnceWith(
      "admin:assistant",
    );
    expect(mocks.loadStatus).toHaveBeenCalledOnce();
    expect(mocks.loadSessions).toHaveBeenCalledOnce();
    expect(mocks.loadModelConfigs).toHaveBeenCalledExactlyOnceWith(actor);
    expect(mocks.loadSkillRuntime).toHaveBeenCalledExactlyOnceWith(actor);
    expect(mocks.createSkillListHandler).toHaveBeenCalledOnce();
    expect(mocks.skillListHandler).toHaveBeenCalledOnce();
    expect(serializedProps).not.toMatch(
      /sk-fixture-secret|ciphertext|nonce|https?:\/\/|assertion/iu,
    );
    expect(screen.getByRole("heading", { name: "AI 助理运营" })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "受保护的助手测试控制台" }),
    ).toBeVisible();
    expect(screen.getByText("safe-review")).toBeVisible();
  });

  it("starts status, sessions, models, runtime and Skill snapshot loading in parallel", async () => {
    const pendingStatus = deferred<typeof status>();
    const pendingSessions = deferred<typeof sessions>();
    const pendingModels = deferred<AdminModelConfigSnapshot>();
    const pendingRuntime = deferred<typeof skillRuntime>();
    const pendingSkills = deferred<Response>();
    mocks.loadStatus.mockReturnValueOnce(pendingStatus.promise);
    mocks.loadSessions.mockReturnValueOnce(pendingSessions.promise);
    mocks.loadModelConfigs.mockReturnValueOnce(pendingModels.promise);
    mocks.loadSkillRuntime.mockReturnValueOnce(pendingRuntime.promise);
    mocks.skillListHandler.mockReturnValueOnce(pendingSkills.promise);

    const page = AdminAssistantPage();
    await vi.waitFor(() => {
      expect(mocks.loadStatus).toHaveBeenCalledOnce();
      expect(mocks.loadSessions).toHaveBeenCalledOnce();
      expect(mocks.loadModelConfigs).toHaveBeenCalledOnce();
      expect(mocks.loadSkillRuntime).toHaveBeenCalledOnce();
      expect(mocks.skillListHandler).toHaveBeenCalledOnce();
    });

    pendingStatus.resolve(status);
    pendingSessions.resolve(sessions);
    pendingModels.resolve(modelConfigs);
    pendingRuntime.resolve(skillRuntime);
    pendingSkills.resolve(Response.json(skillListResponse));
    await expect(page).resolves.toBeDefined();
  });

  it("does not load protected sources when the page guard rejects", async () => {
    mocks.requirePermission.mockRejectedValueOnce(new Error("denied"));

    await expect(AdminAssistantPage()).rejects.toThrow("denied");
    expect(mocks.loadStatus).not.toHaveBeenCalled();
    expect(mocks.loadSessions).not.toHaveBeenCalled();
    expect(mocks.loadModelConfigs).not.toHaveBeenCalled();
    expect(mocks.loadSkillRuntime).not.toHaveBeenCalled();
    expect(mocks.createSkillListHandler).not.toHaveBeenCalled();
    expect(mocks.loadSkillRuntime).not.toHaveBeenCalled();
  });

  it("does not request the Skill Registry when the actor lacks Skill read permission", async () => {
    mocks.requirePermission.mockResolvedValueOnce({
      ...actor,
      permissions: ["admin:assistant", "admin:assistant:configure"],
    });

    render(await AdminAssistantPage());

    expect(mocks.createSkillListHandler).not.toHaveBeenCalled();
    expect(screen.getByText("degraded / 数据不可确认")).toBeVisible();
    expect(screen.getByText("当前账号没有 Skill 库读取权限。")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "刷新 Skill 列表" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /上传 Skill/u }),
    ).not.toBeInTheDocument();
  });

  it("renders one consistent unavailable persistence truth table when runtime resolution fails", async () => {
    mocks.loadStatus.mockResolvedValueOnce(unavailableStatus);
    mocks.loadSessions.mockResolvedValueOnce(unavailableSessions);

    render(await AdminAssistantPage());

    const runtimeRegion = screen
      .getByRole("heading", { name: "运行时状态" })
      .closest("section");
    const configurationRegion = screen
      .getByRole("heading", { name: "只读配置" })
      .closest("aside");
    const sessionsRegion = screen
      .getByRole("heading", { name: "会话持久化" })
      .closest("section");
    expect(runtimeRegion).not.toBeNull();
    expect(configurationRegion).not.toBeNull();
    expect(sessionsRegion).not.toBeNull();

    expect(
      within(runtimeRegion!).getByText("Persistence").nextElementSibling,
    ).toHaveTextContent("unavailable");
    expect(
      within(configurationRegion!).getByText("会话存储").nextElementSibling,
    ).toHaveTextContent("状态不可用");
    expect(
      within(sessionsRegion!).getByText("持久化状态不可用；管理列表不可用。"),
    ).toBeVisible();
    expect(
      within(sessionsRegion!).getByText(/unavailable.*not_available/iu),
    ).toBeVisible();
    expect(within(sessionsRegion!).getByText("列表不可用")).toBeVisible();
    expect(
      within(configurationRegion!).queryByText("未启用"),
    ).not.toBeInTheDocument();
    expect(
      within(configurationRegion!).queryByText("AgentOS 持久化已启用"),
    ).not.toBeInTheDocument();
    expect(
      within(sessionsRegion!).queryByText(/持久化已启用|未启用/u),
    ).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /agent:7777|security|secret/iu,
    );
  });

  it("renders a disabled model control panel when its internal transport is unavailable", async () => {
    mocks.loadModelConfigs.mockRejectedValueOnce(
      new Error(
        "raw AGENTOS_INTERNAL_URL=http://agent:7777 OS_SECURITY_KEY=secret",
      ),
    );

    const pagePromise = AdminAssistantPage();
    await expect(pagePromise).resolves.toBeDefined();
    render(await pagePromise);

    expect(screen.getByText("控制面暂不可用")).toBeVisible();
    expect(screen.getByText("模型配置控制面暂不可用。")).toBeVisible();
    expect(screen.getByRole("button", { name: "保存草稿" })).toBeDisabled();
    expect(document.body.textContent).not.toMatch(
      /raw|agent:7777|security|secret/iu,
    );
  });

  it("renders a degraded Skill snapshot instead of a fake normal empty library", async () => {
    mocks.skillListHandler.mockResolvedValueOnce(
      new Response(null, { status: 503 }),
    );

    render(await AdminAssistantPage());

    expect(screen.getByText("degraded / 数据不可确认")).toBeVisible();
    expect(
      screen.getByText("Skill 列表不可用，不能确认库是否为空。"),
    ).toBeVisible();
    expect(screen.queryByText("当前没有 Skill。")).not.toBeInTheDocument();
  });

  it("degrades only Skill configuration when runtime control is unavailable", async () => {
    mocks.loadSkillRuntime.mockRejectedValueOnce(
      new Error("raw runtime DSN and private path"),
    );

    render(await AdminAssistantPage());

    expect(screen.getByText("运行状态不一致")).toBeVisible();
    expect(screen.getByText("runtime_degraded")).toBeVisible();
    expect(screen.getByText("safe-review")).toBeVisible();
    expect(document.body.textContent).not.toMatch(/raw runtime|private path/iu);
  });
});
