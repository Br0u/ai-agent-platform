import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  loadStatus: vi.fn(),
  loadSessions: vi.fn(),
}));

vi.mock("@/server/auth/access", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/app/api/v1/admin/assistant/status/handler", () => ({
  loadAdminAssistantStatus: mocks.loadStatus,
}));
vi.mock("@/app/api/v1/admin/assistant/sessions/handler", () => ({
  loadPlaceholderAdminAssistantSessions: mocks.loadSessions,
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
    defaultAgent: "M 企业助理（占位）",
    model: "未配置",
    skills: "未接入",
    sessionStorage: "未启用",
  },
  message: "当前仅提供本地占位回复。",
};

const sessions = {
  persistence: "disabled" as const,
  capability: "placeholder" as const,
  items: [],
  message: "占位模式不持久化会话；会话审计将在存储接入后开放。",
};

describe("AdminAssistantPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ realm: "workforce" });
    mocks.loadStatus.mockResolvedValue(status);
    mocks.loadSessions.mockResolvedValue(sessions);
  });

  it("requires the exact assistant permission before loading protected data", async () => {
    render(await AdminAssistantPage());

    expect(mocks.requirePermission).toHaveBeenCalledExactlyOnceWith(
      "admin:assistant",
    );
    expect(mocks.loadStatus).toHaveBeenCalledOnce();
    expect(mocks.loadSessions).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "AI 助理运营" })).toBeVisible();
  });

  it("does not load protected sources when the page guard rejects", async () => {
    mocks.requirePermission.mockRejectedValueOnce(new Error("denied"));

    await expect(AdminAssistantPage()).rejects.toThrow("denied");
    expect(mocks.loadStatus).not.toHaveBeenCalled();
    expect(mocks.loadSessions).not.toHaveBeenCalled();
  });
});
