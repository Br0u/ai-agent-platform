import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { ComponentProps } from "react";
import type {
  AdminAssistantSessionsSnapshot,
  AdminAssistantStatusSnapshot,
} from "@/features/assistant/admin-assistant-contract";
import type { AdminModelConfigSnapshot } from "@/features/assistant/admin-model-config-contract";
import type { AdminSkillRegistrySnapshot } from "./assistant-skill-registry-panel";
import { AssistantAdminPage as ProductionAssistantAdminPage } from "./assistant-admin-page";

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
      readiness: { state: "closed" as const, consecutiveFailures: 2 },
      execution: { state: "open" as const, consecutiveFailures: 3 },
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
} satisfies AdminAssistantStatusSnapshot;

const sessions = {
  persistence: "disabled" as const,
  listing: "not_available" as const,
  message: "占位模式未持久化会话；管理列表不可用。",
} satisfies AdminAssistantSessionsSnapshot;

const agentosSessions = {
  persistence: "agentos" as const,
  listing: "not_available" as const,
  message: "AgentOS 持久化已启用，但管理列表不在本阶段范围。",
} satisfies AdminAssistantSessionsSnapshot;

const unavailableSessions = {
  persistence: "unavailable" as const,
  listing: "not_available" as const,
  message: "持久化状态不可用；管理列表不可用。",
} satisfies AdminAssistantSessionsSnapshot;

const modelConfigs = {
  version: "1",
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
    capability: "placeholder",
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

const skillSnapshot = {
  capability: "available",
  skills: [],
  page: { limit: 25, offset: 0, returned: 0 },
} satisfies AdminSkillRegistrySnapshot;

const skillPermissions = {
  canUpload: true,
  canManageConnections: false,
  canReview: true,
  canConfigure: false,
};

type PageProps = ComponentProps<typeof ProductionAssistantAdminPage>;

function AssistantAdminPage(
  props: Omit<
    PageProps,
    "skillActorUserId" | "skillCanRead" | "skillPermissions" | "skillSnapshot"
  > &
    Partial<
      Pick<
        PageProps,
        | "skillActorUserId"
        | "skillCanRead"
        | "skillPermissions"
        | "skillSnapshot"
      >
    >,
) {
  return (
    <ProductionAssistantAdminPage
      skillActorUserId="11111111-1111-4111-8111-111111111111"
      skillCanRead
      skillPermissions={skillPermissions}
      skillSnapshot={skillSnapshot}
      {...props}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AssistantAdminPage", () => {
  it("places the real Skill Registry after model configuration and before the roadmap", () => {
    render(
      <AssistantAdminPage
        modelConfigs={modelConfigs}
        sessions={sessions}
        skillActorUserId="11111111-1111-4111-8111-111111111111"
        skillCanRead
        skillPermissions={skillPermissions}
        skillSnapshot={skillSnapshot}
        status={status}
      />,
    );

    const models = screen.getByRole("heading", { name: "云模型配置" });
    const skills = screen.getByRole("heading", { name: "Skill 库" });
    const roadmap = screen.getByRole("heading", { name: "后续能力入口" });
    expect(
      models.compareDocumentPosition(skills) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      skills.compareDocumentPosition(roadmap) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows four honest status cells and read-only configuration", () => {
    const { container } = render(
      <AssistantAdminPage
        modelConfigs={modelConfigs}
        sessions={sessions}
        status={status}
      />,
    );

    expect(screen.getAllByTestId("assistant-status-cell")).toHaveLength(4);
    expect(screen.getByText("AgentOS")).toBeVisible();
    expect(screen.getByText("会话数据库")).toBeVisible();
    expect(screen.getAllByText("模型")).toHaveLength(2);
    expect(screen.getByText("公开入口")).toBeVisible();
    expect(screen.getByRole("heading", { name: "只读配置" })).toBeVisible();
    expect(screen.getByText("码多多（占位）")).toBeVisible();
    expect(screen.getByRole("heading", { name: "运行时状态" })).toBeVisible();
    expect(
      screen.getByText("Readiness Circuit").nextElementSibling,
    ).toHaveTextContent("closed");
    expect(
      screen.getByText("Readiness Failures").nextElementSibling,
    ).toHaveTextContent("2");
    expect(
      screen.getByText("Execution Circuit").nextElementSibling,
    ).toHaveTextContent("open");
    expect(
      screen.getByText("Execution Failures").nextElementSibling,
    ).toHaveTextContent("3");
    expect(screen.getByText("Health TTL").nextElementSibling).toHaveTextContent(
      "5000 ms",
    );
    expect(
      screen.getByText("Probe Timeout").nextElementSibling,
    ).toHaveTextContent("1500 ms");
    expect(
      screen.getByText("Failure Threshold").nextElementSibling,
    ).toHaveTextContent("3");
    expect(container.querySelectorAll("input[type='password']")).toHaveLength(
      1,
    );
    expect(screen.getByLabelText("新 API Key（必填）")).toHaveValue("");
    expect(container.textContent).not.toMatch(/timestamp|openedAt|raw error/iu);
  });

  it("keeps the approved section order on the existing admin page", () => {
    render(
      <AssistantAdminPage
        modelConfigs={modelConfigs}
        sessions={sessions}
        status={status}
      />,
    );

    const services = screen.getByRole("list", { name: "AI 助理服务状态" });
    const runtime = screen.getByRole("heading", { name: "运行时状态" });
    const models = screen.getByRole("heading", { name: "云模型配置" });
    const roadmap = screen.getByRole("heading", { name: "后续能力入口" });
    const consoleHeading = screen.getByRole("heading", {
      name: "受保护的助手测试控制台",
    });
    const configuration = screen.getByRole("heading", { name: "只读配置" });
    const sessionsHeading = screen.getByRole("heading", {
      name: "会话持久化",
    });
    expect(
      services.compareDocumentPosition(runtime) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      runtime.compareDocumentPosition(models) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      models.compareDocumentPosition(consoleHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      models.compareDocumentPosition(roadmap) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      roadmap.compareDocumentPosition(consoleHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      consoleHeading.compareDocumentPosition(configuration) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      configuration.compareDocumentPosition(sessionsHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("loads page styling from a dedicated stylesheet instead of inline CSS", () => {
    const component = readFileSync(
      "src/components/admin/assistant-admin-page.tsx",
      "utf8",
    );
    const css = readFileSync(
      "src/components/admin/assistant-admin-page.css",
      "utf8",
    );

    expect(component).not.toContain("<style>");
    expect(component).toContain('import "./assistant-admin-page.css"');
    expect(css).toContain(".assistant-admin__status-grid");
  });

  it("keeps session audit disabled without a duplicate Skill management action", () => {
    render(
      <AssistantAdminPage
        modelConfigs={modelConfigs}
        sessions={sessions}
        status={status}
      />,
    );

    expect(screen.getByRole("button", { name: "会话审计" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: /暂不可用$/u })).toHaveLength(
      4,
    );
    for (const action of screen.getAllByRole("button", {
      name: /暂不可用$/u,
    })) {
      expect(action).toBeDisabled();
    }
    expect(
      screen.queryByRole("button", { name: "Skill 管理" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(sessions.message)).toBeVisible();
    expect(screen.queryByText(/客户消息|消息原文/u)).not.toBeInTheDocument();
  });

  it("preserves page-level headings, form names, live regions and tab order", () => {
    const { container } = render(
      <AssistantAdminPage
        modelConfigs={modelConfigs}
        sessions={sessions}
        status={status}
      />,
    );

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const h2Names = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(new Set(h2Names).size).toBe(h2Names.length);

    const providerTab = screen.getByRole("tab", { name: /OpenAI/u });
    const modelId = screen.getByRole("textbox", { name: "Model ID" });
    const endpoint = screen.getByRole("combobox", { name: "Endpoint" });
    const apiKey = screen.getByLabelText("新 API Key（必填）");
    const question = screen.getByRole("textbox", { name: "测试问题" });
    expect(
      providerTab.compareDocumentPosition(modelId) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      modelId.compareDocumentPosition(endpoint) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      endpoint.compareDocumentPosition(apiKey) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      apiKey.compareDocumentPosition(question) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      container.querySelectorAll(
        "[tabindex]:not([tabindex='0']):not([tabindex='-1'])",
      ),
    ).toHaveLength(0);
    expect(
      container.querySelectorAll("[aria-live='polite']").length,
    ).toBeGreaterThanOrEqual(2);

    const explicitAccessibleNames = Array.from(
      container.querySelectorAll<HTMLElement>("[aria-label], [title]"),
      (element) =>
        `${element.getAttribute("aria-label") ?? ""} ${element.getAttribute("title") ?? ""}`,
    ).join(" ");
    expect(explicitAccessibleNames).not.toMatch(
      /(?:sk-[a-z0-9]|ciphertext|nonce|secret|https?:\/\/)/iu,
    );
  });

  it("shows persistence and unavailable listing without a fake zero count", () => {
    render(
      <AssistantAdminPage
        modelConfigs={modelConfigs}
        sessions={sessions}
        status={status}
      />,
    );

    expect(screen.getByRole("heading", { name: "会话持久化" })).toBeVisible();
    expect(screen.getByText("列表不可用")).toBeVisible();
    expect(screen.getByText(/disabled.*not_available/iu)).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "最近会话" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("00")).not.toBeInTheDocument();
  });

  it("states that AgentOS persistence is enabled while listing remains unavailable", () => {
    render(
      <AssistantAdminPage
        modelConfigs={modelConfigs}
        sessions={agentosSessions}
        status={status}
      />,
    );

    expect(screen.getByText(agentosSessions.message)).toBeVisible();
    expect(screen.getByText(/agentos.*not_available/iu)).toBeVisible();
    expect(screen.getByText("列表不可用")).toBeVisible();
    expect(
      screen.queryByText(/可审计|可列出|最近会话/u),
    ).not.toBeInTheDocument();
  });

  it("shows a safe unavailable persistence state without fabricated sessions", () => {
    render(
      <AssistantAdminPage
        modelConfigs={modelConfigs}
        sessions={unavailableSessions}
        status={status}
      />,
    );

    expect(screen.getByText(unavailableSessions.message)).toBeVisible();
    expect(screen.getByText(/unavailable.*not_available/iu)).toBeVisible();
    expect(screen.getByText("列表不可用")).toBeVisible();
    expect(
      screen.queryByText(/raw|secret|最近会话|可审计/iu),
    ).not.toBeInTheDocument();
  });

  it("describes the protected test session truthfully for both provider modes", () => {
    render(
      <AssistantAdminPage
        modelConfigs={modelConfigs}
        sessions={sessions}
        status={status}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "受保护的助手测试控制台" }),
    ).toBeVisible();
    expect(screen.getByText("临时会话，结束后清理")).toBeVisible();
    expect(
      screen.getByText(
        "AgentOS 模式会调用已配置模型；占位模式返回安全占位回答。",
      ),
    ).toBeVisible();
    expect(screen.getByPlaceholderText("输入助手测试问题")).toBeVisible();
    expect(
      screen.queryByText(/占位测试控制台|不调用真实模型|不会写入会话/iu),
    ).not.toBeInTheDocument();
  });

  it("sends an administrator test through the protected admin endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          version: "1",
          requestId: "request-1",
          mode: "placeholder",
          message: {
            id: "message-1",
            role: "assistant",
            content: "AI 服务尚未接入。",
          },
          suggestedActions: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AssistantAdminPage
        modelConfigs={modelConfigs}
        sessions={sessions}
        status={status}
      />,
    );

    fireEvent.change(screen.getByLabelText("测试问题"), {
      target: { value: "检查助手回答" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送测试" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/assistant/chat",
      expect.objectContaining({ method: "POST" }),
    );
    expect(await screen.findByText("AI 服务尚未接入。")).toBeVisible();
  });

  it("uses an internal failure message without public support directions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );
    render(
      <AssistantAdminPage
        modelConfigs={modelConfigs}
        sessions={sessions}
        status={status}
      />,
    );

    fireEvent.change(screen.getByLabelText("测试问题"), {
      target: { value: "检查失败状态" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送测试" }));

    expect(await screen.findByText("测试暂时失败，请稍后重试。")).toBeVisible();
    expect(screen.queryByText(/帮助中心|商务咨询/u)).not.toBeInTheDocument();
  });

  it("renders safe versioned 429 and 503 failures accessibly without raw detail", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            version: "1",
            requestId: "rate-request",
            error: {
              code: "rate_limited",
              message: "raw limiter row and threshold",
              retryable: true,
            },
          },
          { status: 429 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            version: "1",
            requestId: "failed-request",
            error: {
              code: "assistant_unavailable",
              message: "raw http://agent:7777 OS_SECURITY_KEY=private",
              retryable: true,
            },
          },
          { status: 503 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AssistantAdminPage
        modelConfigs={modelConfigs}
        sessions={sessions}
        status={status}
      />,
    );
    const input = screen.getByLabelText("测试问题");

    fireEvent.change(input, { target: { value: "第一次测试" } });
    fireEvent.click(screen.getByRole("button", { name: "发送测试" }));
    expect(await screen.findByText("请求过于频繁，请稍后再试。")).toBeVisible();

    fireEvent.change(input, { target: { value: "第二次测试" } });
    fireEvent.click(screen.getByRole("button", { name: "发送测试" }));
    expect(await screen.findByText("测试暂时失败，请稍后重试。")).toBeVisible();
    expect(
      screen.queryByText(/agent:7777|security_key|limiter row/iu),
    ).not.toBeInTheDocument();
  });
});
