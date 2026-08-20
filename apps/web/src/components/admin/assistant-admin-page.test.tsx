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
import type { AdminAssistantStatusSnapshot } from "@/features/assistant/admin-assistant-contract";
import type { AdminModelConfigSnapshot } from "@/features/assistant/admin-model-config-contract";
import type { AdminInputPolicySnapshot } from "@/features/assistant/admin-input-policy-contract";
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
    pageMemory: "仅当前页面内存；刷新或离开后清空",
  },
  message: "当前仅提供本地占位回复。",
} satisfies AdminAssistantStatusSnapshot;

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
    baseUrl: null,
    revision: null,
    testStatus: "not_configured" as const,
    lastTestedAt: null,
    apiKey: null,
    activeRevision: null,
  })),
  endpoints: {
    openai: [
      {
        id: "openai-default",
        label: "OpenAI 官方",
        baseUrl: null,
        apiKeyRequired: true,
        insecureHttp: false,
      },
    ],
    anthropic: [
      {
        id: "anthropic-default",
        label: "Claude 官方",
        baseUrl: null,
        apiKeyRequired: true,
        insecureHttp: false,
      },
    ],
    google: [
      {
        id: "google-default",
        label: "Gemini 官方",
        baseUrl: null,
        apiKeyRequired: true,
        insecureHttp: false,
      },
    ],
    dashscope: [
      {
        id: "dashscope-default",
        label: "Qwen 官方",
        baseUrl: null,
        apiKeyRequired: true,
        insecureHttp: false,
      },
    ],
    deepseek: [
      {
        id: "deepseek-default",
        label: "DeepSeek 官方",
        baseUrl: null,
        apiKeyRequired: true,
        insecureHttp: false,
      },
    ],
    minimax: [
      {
        id: "minimax-default",
        label: "MiniMax 官方",
        baseUrl: null,
        apiKeyRequired: true,
        insecureHttp: false,
      },
    ],
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
  canConfigure: false,
};

const inputPolicy = {
  version: "1",
  revision: 3,
  termCount: 2,
  terms: ["example", "敏感"],
  updatedAt: "2026-08-12T01:02:03.000Z",
  canConfigure: true,
} satisfies AdminInputPolicySnapshot;

type PageProps = ComponentProps<typeof ProductionAssistantAdminPage>;

function AssistantAdminPage(
  props: Omit<
    PageProps,
    "inputPolicy" | "skillCanRead" | "skillPermissions" | "skillSnapshot"
  > &
    Partial<
      Pick<PageProps, "skillCanRead" | "skillPermissions" | "skillSnapshot">
    >,
) {
  return (
    <ProductionAssistantAdminPage
      inputPolicy={inputPolicy}
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
  it("keeps testing in current-page memory without a session prop or tab", () => {
    const source = readFileSync(
      "src/components/admin/assistant-admin-page.tsx",
      "utf8",
    );

    expect(source).not.toMatch(/AdminAssistantSessions|sessions[,:]/u);
    expect(source).not.toContain("测试与会话");
    expect(source).not.toContain("会话持久化");
    expect(source).toContain("当前页面内存");
  });

  it("switches between the five focused Agent management tabs", () => {
    render(
      <AssistantAdminPage
        modelConfigs={modelConfigs}
        skillCanRead
        skillPermissions={skillPermissions}
        skillSnapshot={skillSnapshot}
        status={status}
      />,
    );

    expect(screen.getByRole("heading", { name: "运行时状态" })).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "模型配置" }));
    expect(screen.getByRole("heading", { name: "云模型配置" })).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Skills" }));
    expect(screen.getByRole("heading", { name: "Skill 库" })).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "内容规则" }));
    expect(screen.getByRole("heading", { name: "输入内容规则" })).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "测试" }));
    expect(
      screen.getByRole("heading", { name: "受保护的助手测试控制台" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "后续能力入口" }),
    ).not.toBeInTheDocument();
  });

  it("shows four honest status cells and read-only configuration", () => {
    const { container } = render(
      <AssistantAdminPage modelConfigs={modelConfigs} status={status} />,
    );

    expect(screen.getAllByTestId("assistant-status-cell")).toHaveLength(4);
    expect(screen.getByText("AgentOS")).toBeVisible();
    expect(screen.getByText("会话数据库")).toBeVisible();
    expect(screen.getByText("模型")).toBeVisible();
    expect(screen.getByText("公开入口")).toBeVisible();
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
    fireEvent.click(screen.getByRole("tab", { name: "模型配置" }));
    expect(container.querySelectorAll("input[type='password']")).toHaveLength(
      1,
    );
    expect(screen.getByLabelText("新 API Key（必填）")).toHaveValue("");
    expect(container.textContent).not.toMatch(/timestamp|openedAt|raw error/iu);
  });

  it("keeps the approved tab order and one page heading", () => {
    render(<AssistantAdminPage modelConfigs={modelConfigs} status={status} />);

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "运行概览",
      "模型配置",
      "Skills",
      "内容规则",
      "测试",
    ]);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("preserves the confirmed policy revision and draft across tab switches", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        ...inputPolicy,
        revision: 4,
        termCount: 1,
        terms: ["confirmed"],
        updatedAt: "2026-08-12T02:03:04.000Z",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantAdminPage modelConfigs={modelConfigs} status={status} />);
    fireEvent.click(screen.getByRole("tab", { name: "内容规则" }));
    fireEvent.change(screen.getByLabelText("屏蔽词（一行一个）"), {
      target: { value: "Confirmed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存并立即生效" }));
    expect(await screen.findByText("当前版本 4")).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Skills" }));
    fireEvent.click(screen.getByRole("tab", { name: "内容规则" }));

    expect(screen.getByText("当前版本 4")).toBeVisible();
    expect(screen.getByLabelText("屏蔽词（一行一个）")).toHaveValue(
      "confirmed",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  it("preserves accessible controls in each tab", () => {
    const { container } = render(
      <AssistantAdminPage modelConfigs={modelConfigs} status={status} />,
    );

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const h2Names = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(new Set(h2Names).size).toBe(h2Names.length);

    fireEvent.click(screen.getByRole("tab", { name: "模型配置" }));
    const providerSelect = screen.getByRole("combobox", {
      name: "模型供应商",
    });
    const modelId = screen.getByRole("textbox", { name: "Model ID" });
    const endpoint = screen.getByRole("combobox", { name: "Endpoint" });
    const apiKey = screen.getByLabelText("新 API Key（必填）");
    expect(
      providerSelect.compareDocumentPosition(modelId) &
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
    fireEvent.click(screen.getByRole("tab", { name: "测试" }));
    expect(screen.getByRole("textbox", { name: "测试问题" })).toBeVisible();
    expect(
      container.querySelectorAll(
        "[tabindex]:not([tabindex='0']):not([tabindex='-1'])",
      ),
    ).toHaveLength(0);
    expect(
      container.querySelectorAll("[aria-live='polite']").length,
    ).toBeGreaterThanOrEqual(1);

    const explicitAccessibleNames = Array.from(
      container.querySelectorAll<HTMLElement>("[aria-label], [title]"),
      (element) =>
        `${element.getAttribute("aria-label") ?? ""} ${element.getAttribute("title") ?? ""}`,
    ).join(" ");
    expect(explicitAccessibleNames).not.toMatch(
      /(?:sk-[a-z0-9]|ciphertext|nonce|secret|https?:\/\/)/iu,
    );
  });

  it("describes the protected test session truthfully for both provider modes", () => {
    render(<AssistantAdminPage modelConfigs={modelConfigs} status={status} />);

    fireEvent.click(screen.getByRole("tab", { name: "测试" }));

    expect(
      screen.getByRole("heading", { name: "受保护的助手测试控制台" }),
    ).toBeVisible();
    expect(
      screen.getByText("仅保留在当前页面内存；刷新或离开后清空"),
    ).toBeVisible();
    expect(
      screen.getByText(
        "AgentOS 模式会调用已配置模型；占位模式返回安全占位回答。",
      ),
    ).toBeVisible();
    expect(screen.getByText("只读 · 当前运行合同")).toBeVisible();
    expect(screen.queryByText("只读 · 待接入")).not.toBeInTheDocument();
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
    render(<AssistantAdminPage modelConfigs={modelConfigs} status={status} />);

    fireEvent.click(screen.getByRole("tab", { name: "测试" }));

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
    render(<AssistantAdminPage modelConfigs={modelConfigs} status={status} />);

    fireEvent.click(screen.getByRole("tab", { name: "测试" }));

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
    render(<AssistantAdminPage modelConfigs={modelConfigs} status={status} />);
    fireEvent.click(screen.getByRole("tab", { name: "测试" }));
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
