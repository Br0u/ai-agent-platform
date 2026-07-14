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
    circuit: { state: "closed" as const, consecutiveFailures: 2 },
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
} satisfies AdminAssistantStatusSnapshot;

const sessions = {
  persistence: "disabled" as const,
  capability: "placeholder" as const,
  items: [],
  message: "占位模式不持久化会话；会话审计将在存储接入后开放。",
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
    expect(screen.getByText("M 企业助理（占位）")).toBeVisible();
    expect(screen.getByRole("heading", { name: "运行时状态" })).toBeVisible();
    expect(screen.getByText("Circuit").nextElementSibling).toHaveTextContent(
      "closed",
    );
    expect(screen.getByText("Failures").nextElementSibling).toHaveTextContent(
      "2",
    );
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
      target: { value: "检查占位合同" },
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
