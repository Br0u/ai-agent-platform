import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type {
  AdminAssistantSessionsSnapshot,
  AdminAssistantStatusSnapshot,
} from "@/features/assistant/admin-assistant-contract";
import { AssistantAdminPage } from "./assistant-admin-page";

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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AssistantAdminPage", () => {
  it("shows four honest status cells and read-only configuration", () => {
    const { container } = render(
      <AssistantAdminPage sessions={sessions} status={status} />,
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
      0,
    );
    expect(
      screen.queryByLabelText(/model.*key|api.*key/iu),
    ).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/timestamp|openedAt|raw error/iu);
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

  it("keeps future audit and Skill capabilities visibly disabled", () => {
    render(<AssistantAdminPage sessions={sessions} status={status} />);

    expect(screen.getByRole("button", { name: "会话审计" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Skill 管理" })).toBeDisabled();
    expect(screen.getByText(sessions.message)).toBeVisible();
    expect(screen.queryByText(/客户消息|消息原文/u)).not.toBeInTheDocument();
  });

  it("shows persistence and unavailable listing without a fake zero count", () => {
    render(<AssistantAdminPage sessions={sessions} status={status} />);

    expect(screen.getByRole("heading", { name: "会话持久化" })).toBeVisible();
    expect(screen.getByText("列表不可用")).toBeVisible();
    expect(screen.getByText(/disabled.*not_available/iu)).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "最近会话" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("00")).not.toBeInTheDocument();
  });

  it("states that AgentOS persistence is enabled while listing remains unavailable", () => {
    render(<AssistantAdminPage sessions={agentosSessions} status={status} />);

    expect(screen.getByText(agentosSessions.message)).toBeVisible();
    expect(screen.getByText(/agentos.*not_available/iu)).toBeVisible();
    expect(screen.getByText("列表不可用")).toBeVisible();
    expect(
      screen.queryByText(/可审计|可列出|最近会话/u),
    ).not.toBeInTheDocument();
  });

  it("shows a safe unavailable persistence state without fabricated sessions", () => {
    render(
      <AssistantAdminPage sessions={unavailableSessions} status={status} />,
    );

    expect(screen.getByText(unavailableSessions.message)).toBeVisible();
    expect(screen.getByText(/unavailable.*not_available/iu)).toBeVisible();
    expect(screen.getByText("列表不可用")).toBeVisible();
    expect(
      screen.queryByText(/raw|secret|最近会话|可审计/iu),
    ).not.toBeInTheDocument();
  });

  it("describes the protected test session truthfully for both provider modes", () => {
    render(<AssistantAdminPage sessions={sessions} status={status} />);

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
    render(<AssistantAdminPage sessions={sessions} status={status} />);

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
    render(<AssistantAdminPage sessions={sessions} status={status} />);

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
    render(<AssistantAdminPage sessions={sessions} status={status} />);
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
