import { readFileSync } from "node:fs";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AdminModelConfigItem,
  AdminModelConfigSnapshot,
  AdminModelProvider,
} from "@/features/assistant/admin-model-config-contract";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

import { AssistantModelConfigPanel } from "./assistant-model-config-panel";

const PROVIDERS = [
  ["openai", "OpenAI"],
  ["anthropic", "Claude"],
  ["google", "Gemini"],
  ["dashscope", "Qwen / DashScope"],
  ["deepseek", "DeepSeek"],
  ["minimax", "MiniMax"],
] as const;

function emptyConfig(
  provider: AdminModelProvider,
  displayName: string,
): AdminModelConfigItem {
  return {
    provider,
    displayName,
    modelId: null,
    endpointId: null,
    revision: null,
    testStatus: "not_configured",
    lastTestedAt: null,
    apiKey: null,
    activeRevision: null,
  };
}

function snapshot(
  overrides: Partial<AdminModelConfigSnapshot> = {},
): AdminModelConfigSnapshot {
  return {
    version: "1",
    configs: PROVIDERS.map(([provider, displayName]) =>
      emptyConfig(provider, displayName),
    ),
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
    ...overrides,
  };
}

function savedOpenAi(
  overrides: Partial<AdminModelConfigItem> = {},
): AdminModelConfigItem {
  return {
    provider: "openai",
    displayName: "OpenAI",
    modelId: "gpt-5",
    endpointId: "openai-default",
    revision: 2,
    testStatus: "untested",
    lastTestedAt: "2026-07-17T08:00:00.000Z",
    apiKey: { configured: true, lastFour: "1234" },
    activeRevision: 1,
    ...overrides,
  };
}

function withSavedOpenAi(
  overrides: Partial<AdminModelConfigItem> = {},
): AdminModelConfigSnapshot {
  const base = snapshot();
  return {
    ...base,
    configs: base.configs.map((config) =>
      config.provider === "openai" ? savedOpenAi(overrides) : config,
    ),
    runtime: {
      capability: "available",
      source: "dynamic",
      provider: "openai",
      modelId: "gpt-4.1",
      configRevision: 1,
      activationVersion: 7,
    },
  };
}

function safeError(
  code: string,
  options: { redirectTo?: string; retryable?: boolean } = {},
) {
  return {
    version: "1",
    requestId: "11111111-1111-4111-8111-111111111111",
    error: {
      code,
      message: "raw provider detail must never render",
      retryable: options.retryable ?? false,
    },
    ...(options.redirectTo === undefined
      ? {}
      : { redirectTo: options.redirectTo }),
  };
}

function listResponse(value: AdminModelConfigSnapshot) {
  return {
    ...value,
    requestId: "22222222-2222-4222-8222-222222222222",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function revealResponse(key: string) {
  return Response.json({
    version: "1",
    requestId: "55555555-5555-4555-8555-555555555555",
    key,
  });
}

function watchBrowserPersistence() {
  const spies = [
    vi.spyOn(Storage.prototype, "getItem"),
    vi.spyOn(Storage.prototype, "setItem"),
    vi.spyOn(Storage.prototype, "removeItem"),
    vi.spyOn(Storage.prototype, "clear"),
  ];
  const indexedDbOpen = vi.fn();
  const cacheOpen = vi.fn();
  const cacheMatch = vi.fn();
  vi.stubGlobal("indexedDB", { open: indexedDbOpen });
  vi.stubGlobal("caches", { open: cacheOpen, match: cacheMatch });
  return () => {
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(indexedDbOpen).not.toHaveBeenCalled();
    expect(cacheOpen).not.toHaveBeenCalled();
    expect(cacheMatch).not.toHaveBeenCalled();
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  navigation.push.mockReset();
});

describe("AssistantModelConfigPanel", () => {
  it("renders the fixed six-Provider order and all dynamic status truths", () => {
    const value = snapshot();
    value.configs = [
      value.configs[0]!,
      {
        ...emptyConfig("anthropic", "Claude"),
        modelId: "claude-sonnet-4-5",
        endpointId: "anthropic-default",
        revision: 1,
        testStatus: "untested",
        apiKey: { configured: true, lastFour: "2222" },
      },
      {
        ...emptyConfig("google", "Gemini"),
        modelId: "gemini-2.5-pro",
        endpointId: "google-default",
        revision: 2,
        testStatus: "failed",
        apiKey: { configured: true, lastFour: "3333" },
      },
      {
        ...emptyConfig("dashscope", "Qwen / DashScope"),
        modelId: "qwen-max",
        endpointId: "dashscope-default",
        revision: 4,
        testStatus: "passed",
        apiKey: { configured: true, lastFour: "4444" },
        activeRevision: 4,
      },
      {
        ...emptyConfig("deepseek", "DeepSeek"),
        modelId: "deepseek-chat",
        endpointId: "deepseek-default",
        revision: 5,
        testStatus: "passed",
        apiKey: { configured: true, lastFour: "5555" },
        activeRevision: 3,
      },
      {
        ...emptyConfig("minimax", "MiniMax"),
        modelId: "MiniMax-M2",
        endpointId: "minimax-default",
        revision: 6,
        testStatus: "failed",
        apiKey: { configured: true, lastFour: "6666" },
        activeRevision: 2,
      },
    ];

    render(<AssistantModelConfigPanel initialSnapshot={value} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      expect.stringContaining("OpenAI"),
      expect.stringContaining("Claude"),
      expect.stringContaining("Gemini"),
      expect.stringContaining("Qwen / DashScope"),
      expect.stringContaining("DeepSeek"),
      expect.stringContaining("MiniMax"),
    ]);
    expect(tabs[0]).toHaveTextContent("未配置");
    expect(tabs[1]).toHaveTextContent("已配置");
    expect(tabs[2]).toHaveTextContent("测试失败");
    expect(tabs[3]).toHaveTextContent("已启用");
    expect(tabs[4]).toHaveTextContent("当前草稿未启用 · 运行 rev 3");
    expect(tabs[5]).toHaveTextContent("当前草稿测试失败 · 仍运行 rev 2");
    expect(within(tabs[3]!).getByText("运行中")).toBeVisible();
  });

  it("reports a failed test on the currently active revision without hiding that it still runs", () => {
    render(
      <AssistantModelConfigPanel
        initialSnapshot={withSavedOpenAi({
          revision: 2,
          activeRevision: 2,
          testStatus: "failed",
        })}
      />,
    );

    expect(screen.getByRole("tab", { name: /OpenAI/u })).toHaveTextContent(
      "当前启用配置测试失败 · 仍运行 rev 2",
    );
  });

  it("shows deployment bootstrap honestly without exposing its Key", () => {
    const value = snapshot({
      runtime: {
        capability: "available",
        source: "deployment",
        provider: "openai",
        modelId: "gpt-5",
        configRevision: null,
        activationVersion: null,
      },
    });

    render(<AssistantModelConfigPanel initialSnapshot={value} />);

    expect(screen.getAllByRole("tab")[0]).toHaveTextContent(
      "部署配置正在运行 · 后台 Key 不可查看",
    );
    expect(screen.getByLabelText("新 API Key（必填）")).toHaveValue("");
    expect(screen.getByLabelText("新 API Key（必填）")).toBeRequired();
    expect(screen.getByLabelText("新 API Key（必填）")).toHaveAttribute(
      "aria-required",
      "true",
    );
    expect(screen.getByLabelText("Model ID")).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /查看/u }),
    ).not.toBeInTheDocument();
  });

  it("renders reveal only for an authorized dynamic saved Key while control is enabled", () => {
    const cases: AdminModelConfigSnapshot[] = [
      withSavedOpenAi(),
      { ...withSavedOpenAi({ apiKey: null }), canReveal: true },
      {
        ...withSavedOpenAi(),
        canReveal: true,
        controlEnabled: false,
      },
      snapshot({
        canReveal: true,
        runtime: {
          capability: "available",
          source: "deployment",
          provider: "openai",
          modelId: "gpt-5",
          configRevision: null,
          activationVersion: null,
        },
      }),
    ];

    for (const value of cases) {
      const view = render(
        <AssistantModelConfigPanel initialSnapshot={value} />,
      );
      expect(
        screen.queryByRole("button", { name: "查看已保存 Key" }),
      ).not.toBeInTheDocument();
      view.unmount();
    }

    render(
      <AssistantModelConfigPanel
        initialSnapshot={{ ...withSavedOpenAi(), canReveal: true }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "查看已保存 Key" }),
    ).toBeEnabled();
  });

  it("keeps every reveal, copy and hide control at least 44 pixels high", () => {
    const stylesheet = readFileSync(
      "src/components/admin/assistant-admin-page.css",
      "utf8",
    );

    expect(stylesheet).toMatch(
      /\.assistant-model-config__key-status button,\s*\.assistant-model-config__reveal button\s*\{[^}]*min-height:\s*44px;/su,
    );
  });

  it("reveals ordinary selectable plaintext for exactly 30 seconds and clears it on Provider change", async () => {
    vi.useFakeTimers();
    const key = "PANEL-SECRET-SENTINEL";
    const commits: string[] = [];
    const expectNoPersistence = watchBrowserPersistence();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () =>
        Response.json({
          version: "1",
          requestId: "33333333-3333-4333-8333-333333333333",
          key,
        }),
      ),
    );
    render(
      <Profiler
        id="assistant-model-config"
        onRender={() => commits.push(document.body.textContent ?? "")}
      >
        <AssistantModelConfigPanel
          initialSnapshot={{ ...withSavedOpenAi(), canReveal: true }}
        />
      </Profiler>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "查看已保存 Key" }));
    });
    expect(screen.getByText(key)).toBeVisible();
    expect(screen.getByText("30 秒后隐藏")).toBeVisible();
    expect(
      screen.queryByDisplayValue(key, { exact: true }),
    ).not.toBeInTheDocument();
    expect(document.documentElement.outerHTML).not.toContain(`value="${key}"`);

    commits.length = 0;
    fireEvent.click(screen.getByRole("tab", { name: /Claude/u }));
    expect(screen.queryByText(key)).not.toBeInTheDocument();
    expect(
      commits
        .filter((commit) => commit.includes("Claude"))
        .every((commit) => !commit.includes(key)),
    ).toBe(true);

    fireEvent.click(screen.getByRole("tab", { name: /OpenAI/u }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "查看已保存 Key" }));
    });
    await act(async () => vi.advanceTimersByTimeAsync(29_999));
    expect(screen.getByText(key)).toBeVisible();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(screen.queryByText(key)).not.toBeInTheDocument();
    expectNoPersistence();
  });

  it.each([
    [
      "manual hide",
      () => {
        fireEvent.click(screen.getByRole("button", { name: "隐藏 Key" }));
      },
    ],
    [
      "pagehide",
      () => {
        window.dispatchEvent(new PageTransitionEvent("pagehide"));
      },
    ],
    [
      "hidden visibility",
      () => {
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
        document.dispatchEvent(new Event("visibilitychange"));
      },
    ],
  ] as const)(
    "removes the secret sentinel from the DOM on %s",
    async (_path, trigger) => {
      const key = "DOM-CLEANUP-SECRET-SENTINEL";
      const expectNoPersistence = watchBrowserPersistence();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async () => revealResponse(key)),
      );
      render(
        <AssistantModelConfigPanel
          initialSnapshot={{ ...withSavedOpenAi(), canReveal: true }}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "查看已保存 Key" }));
      expect(await screen.findByText(key)).toBeVisible();
      act(trigger);

      expect(screen.queryByText(key)).not.toBeInTheDocument();
      expect(document.body.textContent).not.toContain(key);
      expectNoPersistence();
    },
  );

  it("removes the secret sentinel from the DOM on unmount", async () => {
    const key = "UNMOUNT-SECRET-SENTINEL";
    const expectNoPersistence = watchBrowserPersistence();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => revealResponse(key)),
    );
    const view = render(
      <AssistantModelConfigPanel
        initialSnapshot={{ ...withSavedOpenAi(), canReveal: true }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "查看已保存 Key" }));
    expect(await screen.findByText(key)).toBeVisible();
    view.unmount();

    expect(document.body.textContent).not.toContain(key);
    expectNoPersistence();
  });

  it("does not restore a late secret response after lifecycle abort", async () => {
    const key = "LATE-SECRET-SENTINEL";
    const pending = deferred<Response>();
    const expectNoPersistence = watchBrowserPersistence();
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_input, init) => {
        signal = init?.signal as AbortSignal;
        return pending.promise;
      }),
    );
    render(
      <AssistantModelConfigPanel
        initialSnapshot={{ ...withSavedOpenAi(), canReveal: true }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "查看已保存 Key" }));
    expect(signal?.aborted).toBe(false);
    act(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
    expect(signal?.aborted).toBe(true);
    pending.resolve(revealResponse(key));
    await act(async () => Promise.resolve());

    expect(screen.queryByText(key)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(key);
    expectNoPersistence();
  });

  it.each([
    ["permission_denied", "当前账号无权查看模型密钥。"],
    ["rate_limited", "查看过于频繁，请稍后重试。"],
    ["storage_unavailable", "模型密钥暂时无法查看，请稍后重试。"],
  ] as const)("renders a fixed safe message for %s", async (code, message) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json(safeError(code), { status: 403 })),
    );
    render(
      <AssistantModelConfigPanel
        initialSnapshot={{ ...withSavedOpenAi(), canReveal: true }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "查看已保存 Key" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "raw provider detail",
    );
  });

  it("navigates only for the exact versioned reveal re-auth response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          safeError("reauth_required", { redirectTo: "/staff/re-auth" }),
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          safeError("reauth_required", { redirectTo: "/untrusted" }),
          { status: 401 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const view = render(
      <AssistantModelConfigPanel
        initialSnapshot={{ ...withSavedOpenAi(), canReveal: true }}
        navigateToReauth={navigation.push}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "查看已保存 Key" }));
    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledExactlyOnceWith("/staff/re-auth"),
    );

    view.unmount();
    navigation.push.mockReset();
    render(
      <AssistantModelConfigPanel
        initialSnapshot={{ ...withSavedOpenAi(), canReveal: true }}
        navigateToReauth={navigation.push}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "查看已保存 Key" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "模型密钥暂时无法查看，请稍后重试。",
    );
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("warns before copying and writes to the clipboard only on an explicit click", async () => {
    const key = "COPY-SECRET-SENTINEL";
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          version: "1",
          requestId: "44444444-4444-4444-8444-444444444444",
          key,
        }),
      ),
    );
    render(
      <AssistantModelConfigPanel
        initialSnapshot={{ ...withSavedOpenAi(), canReveal: true }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "查看已保存 Key" }));
    expect(await screen.findByText(key)).toBeVisible();
    expect(
      screen.getByText(
        "复制后由操作系统剪贴板负责保管，30 秒隐藏不会清除剪贴板。",
      ),
    ).toBeVisible();
    expect(writeText).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "复制 Key" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText).toHaveBeenCalledWith(key);
    expect(screen.getByText("密钥已复制。")).toBeVisible();
    expect(screen.getByText("密钥已复制。")).not.toHaveTextContent(key);
  });

  it("keeps Provider and revision read-only while controlling only allowlisted inputs", () => {
    render(
      <AssistantModelConfigPanel
        initialSnapshot={withSavedOpenAi()}
        navigateToReauth={navigation.push}
      />,
    );

    expect(screen.getByLabelText("Provider")).toHaveTextContent("OpenAI");
    expect(
      screen.queryByRole("combobox", { name: "Provider" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Model ID")).toHaveValue("gpt-5");
    expect(screen.getByLabelText("Endpoint")).toHaveValue("openai-default");
    expect(
      screen.getByLabelText("Endpoint").querySelectorAll("option"),
    ).toHaveLength(1);
    expect(screen.getByLabelText("新 API Key（可选）")).toHaveAttribute(
      "type",
      "password",
    );
    expect(screen.getByLabelText("新 API Key（可选）")).toHaveValue("");
    expect(screen.getByLabelText("新 API Key（可选）")).not.toBeRequired();
    expect(screen.getByLabelText("新 API Key（可选）")).toHaveAttribute(
      "aria-required",
      "false",
    );
    expect(
      screen.getByText("当前配置版本").nextElementSibling,
    ).toHaveTextContent("rev 2");
    expect(
      screen.getByText("当前运行版本").nextElementSibling,
    ).toHaveTextContent("rev 1");
    expect(document.querySelector('input[name="expectedRevision"]')).toBeNull();
    expect(screen.getByText("已配置 · 末四位 1234")).toBeVisible();
  });

  it("rejects unsafe or incomplete drafts inline without issuing a request", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantModelConfigPanel initialSnapshot={snapshot()} />);

    fireEvent.change(screen.getByLabelText("Model ID"), {
      target: { value: "https://provider.example/model" },
    });
    fireEvent.change(screen.getByLabelText("新 API Key（必填）"), {
      target: { value: "sk-valid-new" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Model ID 必须是 1–128 个安全字符。",
    );

    fireEvent.change(screen.getByLabelText("Model ID"), {
      target: { value: "gpt-5" },
    });
    fireEvent.change(screen.getByLabelText("新 API Key（必填）"), {
      target: { value: "" },
    });
    fireEvent.submit(screen.getByRole("tabpanel"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "首次配置必须填写 API Key。",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("implements roving tab focus and complete keyboard navigation", () => {
    render(<AssistantModelConfigPanel initialSnapshot={snapshot()} />);
    const tabs = screen.getAllByRole("tab");
    const panel = screen.getByRole("tabpanel");

    expect(new Set(tabs.map((tab) => tab.id)).size).toBe(6);
    expect(tabs[0]).toHaveAttribute("tabindex", "0");
    expect(tabs.slice(1).every((tab) => tab.tabIndex === -1)).toBe(true);
    expect(tabs[0]).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", tabs[0]!.id);

    tabs[0]!.focus();
    fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" });
    expect(tabs[1]).toHaveFocus();
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("tabindex", "0");
    expect(panel).toHaveAttribute("aria-labelledby", tabs[1]!.id);

    fireEvent.keyDown(tabs[1]!, { key: "End" });
    expect(tabs[5]).toHaveFocus();
    fireEvent.keyDown(tabs[5]!, { key: "ArrowRight" });
    expect(tabs[0]).toHaveFocus();
    fireEvent.keyDown(tabs[0]!, { key: "ArrowLeft" });
    expect(tabs[5]).toHaveFocus();
    fireEvent.keyDown(tabs[5]!, { key: "Home" });
    expect(tabs[0]).toHaveFocus();
    fireEvent.keyDown(tabs[0]!, { key: "ArrowDown" });
    expect(tabs[1]).toHaveFocus();
    fireEvent.keyDown(tabs[1]!, { key: "ArrowUp" });
    expect(tabs[0]).toHaveFocus();
  });

  it("saves through the exact PUT boundary, prevents doubles, replaces metadata and refreshes once", async () => {
    const initial = withSavedOpenAi();
    const refreshed = withSavedOpenAi({
      modelId: "gpt-5.1",
      revision: 3,
      apiKey: { configured: true, lastFour: "9999" },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          version: "1",
          requestId: "save-request",
          config: {
            ...savedOpenAi({
              modelId: "gpt-5.1",
              revision: 3,
              apiKey: { configured: true, lastFour: "9999" },
            }),
            activeRevision: null,
          },
        }),
      )
      .mockResolvedValueOnce(Response.json(listResponse(refreshed)));
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantModelConfigPanel initialSnapshot={initial} />);

    fireEvent.change(screen.getByLabelText("Model ID"), {
      target: { value: "gpt-5.1" },
    });
    fireEvent.change(screen.getByLabelText("新 API Key（可选）"), {
      target: { value: "sk-new-9999" },
    });
    const save = screen.getByRole("button", { name: "保存草稿" });
    fireEvent.click(save);
    fireEvent.click(save);

    expect(save).toBeDisabled();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/admin/assistant/model-configs/openai",
      expect.objectContaining({
        method: "PUT",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: "gpt-5.1",
          endpointId: "openai-default",
          apiKey: "sk-new-9999",
          expectedRevision: 2,
        }),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/admin/assistant/model-configs",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      }),
    );
    expect(screen.getByLabelText("新 API Key（可选）")).toHaveValue("");
    expect(await screen.findByText("保存成功，配置状态已刷新。")).toBeVisible();
    expect(
      screen.getByText("当前配置版本").nextElementSibling,
    ).toHaveTextContent("rev 3");
    expect(document.body.textContent).not.toContain("sk-new-9999");
  });

  it("prompts refresh on 409 and redirects only for the exact re-auth contract", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(safeError("configuration_conflict"), { status: 409 }),
      )
      .mockResolvedValueOnce(
        Response.json(
          safeError("reauth_required", { redirectTo: "/staff/re-auth" }),
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            ...safeError("reauth_required"),
            redirectTo: "https://evil.example.test/re-auth",
          },
          { status: 401 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AssistantModelConfigPanel
        initialSnapshot={withSavedOpenAi()}
        navigateToReauth={navigation.push}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    expect(
      await screen.findByText("配置已发生变化，请刷新后重试。"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "刷新配置" })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledExactlyOnceWith("/staff/re-auth"),
    );
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    expect(
      await screen.findByText("操作结果未知，必须刷新配置后才能继续。"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "保存草稿" })).toBeDisabled();
    expect(navigation.push).toHaveBeenCalledOnce();
    expect(document.body.textContent).not.toContain("raw provider detail");
  });

  it("requires a safe refresh after Provider switch aborts a save and discards its late response", async () => {
    let resolveRequest!: (response: Response) => void;
    const request = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => request)
      .mockResolvedValueOnce(
        Response.json(listResponse(withSavedOpenAi({ revision: 3 }))),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantModelConfigPanel initialSnapshot={withSavedOpenAi()} />);

    fireEvent.change(screen.getByLabelText("新 API Key（可选）"), {
      target: { value: "sk-secret-old" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const signal = fetchMock.mock.calls[0]![1]?.signal as AbortSignal;

    fireEvent.click(screen.getByRole("tab", { name: /Claude/u }));
    expect(signal.aborted).toBe(true);
    expect(screen.getByLabelText("新 API Key（必填）")).toHaveValue("");
    expect(
      screen.getByText("操作结果未知，必须刷新配置后才能继续。"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "保存草稿" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "测试并启用" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "刷新配置" })).toBeVisible();

    resolveRequest(
      Response.json({
        version: "1",
        requestId: "late",
        config: savedOpenAi({ revision: 3 }),
      }),
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(screen.getByLabelText("Provider")).toHaveTextContent("Claude");
    expect(screen.getByLabelText("Model ID")).toHaveValue("");
    expect(screen.getByLabelText("新 API Key（必填）")).toHaveValue("");
    expect(fetchMock).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "刷新配置" }));
    expect(
      await screen.findByText("配置状态已刷新，可以继续操作。"),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/admin/assistant/model-configs",
      expect.objectContaining({ method: "GET" }),
    );
    expect(screen.getByRole("button", { name: "保存草稿" })).toBeEnabled();
  });

  it("locks mutations when a save network failure leaves the server result unknown", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("offline"));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AssistantModelConfigPanel
        initialSnapshot={{ ...withSavedOpenAi(), canReveal: true }}
      />,
    );

    fireEvent.change(screen.getByLabelText("新 API Key（可选）"), {
      target: { value: "sk-network-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    expect(
      await screen.findByText("操作结果未知，必须刷新配置后才能继续。"),
    ).toBeVisible();
    expect(screen.getByLabelText("新 API Key（可选）")).toHaveValue("");
    expect(screen.getByRole("button", { name: "保存草稿" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "测试并启用" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "查看已保存 Key" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "查看已保存 Key" }));
    expect(screen.getByRole("button", { name: "刷新配置" })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps an unknown save locked on an old early snapshot and reconciles after its 10 second deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T10:00:00.000Z"));
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(
        Response.json(listResponse(withSavedOpenAi({ revision: 2 }))),
      )
      .mockResolvedValueOnce(
        Response.json(listResponse(withSavedOpenAi({ revision: 2 }))),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantModelConfigPanel initialSnapshot={withSavedOpenAi()} />);

    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByRole("button", { name: "刷新配置" }));
    await act(async () => Promise.resolve());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      screen.getByText("操作结果未知，必须刷新配置后才能继续。"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "保存草稿" })).toBeDisabled();

    await act(async () => vi.advanceTimersByTimeAsync(9_999));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(1));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("button", { name: "保存草稿" })).toBeEnabled();
    expect(screen.getByText("配置状态已刷新，可以继续操作。")).toBeVisible();
  });

  it("requires sync when the authoritative GET after a successful save fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          version: "1",
          requestId: "save-request",
          config: savedOpenAi({ revision: 3 }),
        }),
      )
      .mockResolvedValueOnce(
        Response.json(safeError("provider_unreachable"), { status: 503 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantModelConfigPanel initialSnapshot={withSavedOpenAi()} />);

    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    expect(
      await screen.findByText("操作结果未知，必须刷新配置后才能继续。"),
    ).toBeVisible();
    expect(document.body.textContent).not.toContain(
      "保存成功，但配置状态刷新失败",
    );
    expect(screen.getByRole("button", { name: "保存草稿" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("requires sync when a save response cannot prove the mutation result", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      Response.json({
        version: "1",
        requestId: "save-request",
        config: { provider: "openai" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantModelConfigPanel initialSnapshot={withSavedOpenAi()} />);

    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    expect(
      await screen.findByText("操作结果未知，必须刷新配置后才能继续。"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "保存草稿" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("treats storage_unavailable after save as an unknown mutation result", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(safeError("storage_unavailable"), { status: 503 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantModelConfigPanel initialSnapshot={withSavedOpenAi()} />);

    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    expect(
      await screen.findByText("操作结果未知，必须刷新配置后才能继续。"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "保存草稿" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not claim an old runtime survived when a test request aborts without a response", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("aborted", "AbortError"));
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantModelConfigPanel initialSnapshot={withSavedOpenAi()} />);

    fireEvent.click(screen.getByRole("button", { name: "测试并启用" }));

    expect(
      await screen.findByText("操作结果未知，必须刷新配置后才能继续。"),
    ).toBeVisible();
    expect(document.body.textContent).not.toContain("旧的启用配置继续运行");
    expect(screen.getByRole("button", { name: "保存草稿" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "测试并启用" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not treat an old test status as proof and reconciles after the 60 second test deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T11:00:00.000Z"));
    const staleFailure = withSavedOpenAi({
      testStatus: "failed",
      lastTestedAt: "2026-07-18T09:00:00.000Z",
    });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("aborted", "AbortError"))
      .mockResolvedValueOnce(Response.json(listResponse(staleFailure)))
      .mockResolvedValueOnce(Response.json(listResponse(staleFailure)));
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantModelConfigPanel initialSnapshot={staleFailure} />);

    fireEvent.click(screen.getByRole("button", { name: "测试并启用" }));
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByRole("button", { name: "刷新配置" }));
    await act(async () => Promise.resolve());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      screen.getByText("操作结果未知，必须刷新配置后才能继续。"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "测试并启用" })).toBeDisabled();

    await act(async () => vi.advanceTimersByTimeAsync(59_999));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(1));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("button", { name: "测试并启用" })).toBeEnabled();
  });

  it("does not let another administrator's test and activation unlock an unknown request before its deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T11:30:00.000Z"));
    const concurrentChange = withSavedOpenAi({
      activeRevision: 2,
      testStatus: "passed",
      lastTestedAt: "2026-07-18T11:30:01.000Z",
    });
    concurrentChange.runtime = {
      capability: "available",
      source: "dynamic",
      provider: "openai",
      modelId: "gpt-5",
      configRevision: 2,
      activationVersion: 8,
    };
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("aborted", "AbortError"))
      .mockResolvedValueOnce(Response.json(listResponse(concurrentChange)))
      .mockResolvedValueOnce(Response.json(listResponse(concurrentChange)));
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantModelConfigPanel initialSnapshot={withSavedOpenAi()} />);

    fireEvent.click(screen.getByRole("button", { name: "测试并启用" }));
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByRole("button", { name: "刷新配置" }));
    await act(async () => Promise.resolve());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("tab", { name: /OpenAI/u })).toHaveTextContent(
      "已启用",
    );
    expect(
      screen.getByText("操作结果未知，必须刷新配置后才能继续。"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "测试并启用" })).toBeDisabled();

    await act(async () => vi.advanceTimersByTimeAsync(59_999));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(1));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("button", { name: "测试并启用" })).toBeEnabled();
    expect(screen.getByText("配置状态已刷新，可以继续操作。")).toBeVisible();
  });

  it("treats assistant_unavailable during test activation as unknown without retrying", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(safeError("assistant_unavailable"), { status: 503 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantModelConfigPanel initialSnapshot={withSavedOpenAi()} />);

    fireEvent.click(screen.getByRole("button", { name: "测试并启用" }));

    expect(
      await screen.findByText("操作结果未知，必须刷新配置后才能继续。"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "测试并启用" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("navigates immediately on exact test re-auth without issuing a reconciliation GET", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          safeError("reauth_required", { redirectTo: "/staff/re-auth" }),
          { status: 401 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AssistantModelConfigPanel
        initialSnapshot={withSavedOpenAi()}
        navigateToReauth={navigation.push}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "测试并启用" }));

    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledExactlyOnceWith("/staff/re-auth"),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(
      screen.queryByText("操作结果未知，必须刷新配置后才能继续。"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "测试并启用" })).toBeEnabled();
  });

  it("keeps unknown state across a failed refresh and prevents concurrent refreshes", async () => {
    let resolveRefresh!: (response: Response) => void;
    const pendingRefresh = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockImplementationOnce(() => pendingRefresh)
      .mockResolvedValueOnce(
        Response.json(listResponse(withSavedOpenAi({ revision: 3 }))),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantModelConfigPanel initialSnapshot={withSavedOpenAi()} />);

    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    const refresh = await screen.findByRole("button", { name: "刷新配置" });
    fireEvent.click(refresh);
    fireEvent.click(refresh);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(refresh).toBeDisabled();
    resolveRefresh(
      Response.json(safeError("provider_unreachable"), { status: 503 }),
    );

    await waitFor(() => expect(refresh).toBeEnabled());
    expect(
      screen.getByText("操作结果未知，必须刷新配置后才能继续。"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "保存草稿" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fireEvent.click(refresh);
    expect(
      await screen.findByText("配置状态已刷新，可以继续操作。"),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("button", { name: "保存草稿" })).toBeEnabled();
  });

  it("keeps a deadline reconciliation safe across a Provider switch", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T12:00:00.000Z"));
    let resolveRefresh!: (response: Response) => void;
    const pendingRefresh = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockImplementationOnce(() => pendingRefresh);
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantModelConfigPanel initialSnapshot={withSavedOpenAi()} />);

    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await act(async () => Promise.resolve());
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    const signal = fetchMock.mock.calls[1]![1]?.signal as AbortSignal;

    fireEvent.click(screen.getByRole("tab", { name: /Claude/u }));
    expect(signal.aborted).toBe(false);
    resolveRefresh(
      Response.json(listResponse(withSavedOpenAi({ revision: 3 }))),
    );
    await act(async () => Promise.resolve());

    expect(screen.getByLabelText("Provider")).toHaveTextContent("Claude");
    expect(screen.getByLabelText("Model ID")).toHaveValue("");
    expect(screen.getByRole("button", { name: "保存草稿" })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("defers the deadline reconciliation while hidden and retries when visible", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T12:30:00.000Z"));
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(
        Response.json(listResponse(withSavedOpenAi({ revision: 2 }))),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantModelConfigPanel initialSnapshot={withSavedOpenAi()} />);

    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await act(async () => Promise.resolve());
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");

    await act(async () => vi.advanceTimersByTimeAsync(10_000));

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "保存草稿" })).toBeDisabled();

    await act(async () => {
      visibility.mockReturnValue("visible");
      fireEvent(document, new Event("visibilitychange"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "保存草稿" })).toBeEnabled();
  });

  it("clears a scheduled reconciliation when unknown state is unmounted", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T12:45:00.000Z"));
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const rendered = render(
      <AssistantModelConfigPanel initialSnapshot={withSavedOpenAi()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await act(async () => Promise.resolve());
    expect(
      screen.getByText("操作结果未知，必须刷新配置后才能继续。"),
    ).toBeVisible();

    rendered.unmount();
    await act(async () => vi.advanceTimersByTimeAsync(10_000));

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each(["pagehide", "hidden"] as const)(
    "clears Key, marks unknown on %s and recovers only after the return GET",
    async (lifecycle) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockImplementationOnce(() => new Promise<Response>(() => undefined))
        .mockResolvedValueOnce(
          Response.json(
            listResponse(
              withSavedOpenAi({
                revision: 3,
                modelId: "gpt-5.1",
              }),
            ),
          ),
        );
      vi.stubGlobal("fetch", fetchMock);
      render(<AssistantModelConfigPanel initialSnapshot={withSavedOpenAi()} />);

      fireEvent.change(screen.getByLabelText("Model ID"), {
        target: { value: "gpt-5.1" },
      });
      fireEvent.change(screen.getByLabelText("新 API Key（可选）"), {
        target: { value: "sk-lifecycle-secret" },
      });
      fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      const signal = fetchMock.mock.calls[0]![1]?.signal as AbortSignal;

      let visibility: ReturnType<typeof vi.spyOn> | null = null;
      if (lifecycle === "pagehide") {
        fireEvent(window, new Event("pagehide"));
      } else {
        visibility = vi
          .spyOn(document, "visibilityState", "get")
          .mockReturnValue("hidden");
        fireEvent(document, new Event("visibilitychange"));
      }

      expect(signal.aborted).toBe(true);
      expect(screen.getByLabelText("新 API Key（可选）")).toHaveValue("");
      expect(
        screen.getByText("操作结果未知，必须刷新配置后才能继续。"),
      ).toBeVisible();
      expect(fetchMock).toHaveBeenCalledOnce();

      if (lifecycle === "pagehide") {
        fireEvent(window, new Event("pageshow"));
      } else {
        visibility!.mockReturnValue("visible");
        fireEvent(document, new Event("visibilitychange"));
      }

      expect(
        await screen.findByText("配置状态已刷新，可以继续操作。"),
      ).toBeVisible();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(screen.getByLabelText("Model ID")).toHaveValue("gpt-5.1");
      expect(screen.getByRole("button", { name: "保存草稿" })).toBeEnabled();
    },
  );

  it("aborts in-flight work on unmount", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
    const rendered = render(
      <AssistantModelConfigPanel initialSnapshot={withSavedOpenAi()} />,
    );
    fireEvent.change(screen.getByLabelText("新 API Key（可选）"), {
      target: { value: "sk-unmount-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const signal = fetchMock.mock.calls[0]![1]?.signal as AbortSignal;

    rendered.unmount();

    expect(signal.aborted).toBe(true);
  });

  it("tests once and reads one safe snapshot for activation truth and lastTestedAt", async () => {
    const activated = withSavedOpenAi({
      activeRevision: 2,
      testStatus: "passed",
      lastTestedAt: "2026-07-18T09:30:00.000Z",
    });
    activated.runtime = {
      capability: "available",
      source: "dynamic",
      provider: "openai",
      modelId: "gpt-5",
      configRevision: 2,
      activationVersion: 8,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          version: "1",
          requestId: "activate-request",
          activation: {
            provider: "openai",
            configRevision: 2,
            activationVersion: 8,
          },
        }),
      )
      .mockResolvedValueOnce(Response.json(listResponse(activated)));
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantModelConfigPanel initialSnapshot={withSavedOpenAi()} />);

    fireEvent.click(screen.getByRole("button", { name: "测试并启用" }));

    expect(screen.getByRole("button", { name: "测试中…" })).toBeDisabled();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/admin/assistant/model-configs/openai/test-and-activate",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ revision: 2 }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/admin/assistant/model-configs",
      expect.objectContaining({ method: "GET" }),
    );
    expect(
      await screen.findByText("测试通过，已启用 OpenAI rev 2。"),
    ).toBeVisible();
    expect(screen.getByRole("tab", { name: /OpenAI/u })).toHaveTextContent(
      "已启用",
    );
    expect(screen.getByRole("tab", { name: /OpenAI/u })).toHaveTextContent(
      "最近测试 2026-07-18T09:30:00.000Z",
    );
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith("/test-and-activate"),
      ),
    ).toHaveLength(1);
  });

  it("reads failure truth once after a confirmed failed test and never retries the test", async () => {
    const failed = withSavedOpenAi({
      testStatus: "failed",
      lastTestedAt: "2026-07-18T09:45:00.000Z",
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(safeError("credential_rejected"), { status: 422 }),
      )
      .mockResolvedValueOnce(Response.json(listResponse(failed)));
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantModelConfigPanel initialSnapshot={withSavedOpenAi()} />);

    fireEvent.click(screen.getByRole("button", { name: "测试并启用" }));

    expect(
      await screen.findByText("模型测试失败，配置状态已刷新。"),
    ).toBeVisible();
    expect(screen.getByRole("tab", { name: /OpenAI/u })).toHaveTextContent(
      "当前草稿测试失败 · 仍运行 rev 1",
    );
    expect(screen.getByRole("tab", { name: /OpenAI/u })).toHaveTextContent(
      "最近测试 2026-07-18T09:45:00.000Z",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/admin/assistant/model-configs",
      expect.objectContaining({ method: "GET" }),
    );
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith("/test-and-activate"),
      ),
    ).toHaveLength(1);
    expect(document.body.textContent).not.toContain("raw provider detail");
  });

  it("enters unknown state when the snapshot after a settled test cannot be read", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(safeError("credential_rejected"), { status: 422 }),
      )
      .mockResolvedValueOnce(
        Response.json(safeError("provider_unreachable"), { status: 503 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantModelConfigPanel initialSnapshot={withSavedOpenAi()} />);

    fireEvent.click(screen.getByRole("button", { name: "测试并启用" }));

    expect(
      await screen.findByText("操作结果未知，必须刷新配置后才能继续。"),
    ).toBeVisible();
    expect(document.body.textContent).not.toContain("旧的启用配置继续运行");
    expect(screen.getByRole("button", { name: "保存草稿" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith("/test-and-activate"),
      ),
    ).toHaveLength(1);
  });

  it("keeps an activation conflict explicit without entering unknown or auto-refreshing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(safeError("configuration_conflict"), { status: 409 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantModelConfigPanel initialSnapshot={withSavedOpenAi()} />);

    fireEvent.click(screen.getByRole("button", { name: "测试并启用" }));

    expect(
      await screen.findByText("配置已发生变化，请刷新后重试。"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "刷新配置" })).toBeVisible();
    expect(screen.getByRole("tab", { name: /OpenAI/u })).toHaveTextContent(
      "当前草稿未启用 · 运行 rev 1",
    );
    expect(screen.getByRole("button", { name: "保存草稿" })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    [false, true],
    [true, false],
  ] as const)(
    "enforces read-only state for canConfigure=%s controlEnabled=%s",
    (canConfigure, controlEnabled) => {
      render(
        <AssistantModelConfigPanel
          initialSnapshot={snapshot({ canConfigure, controlEnabled })}
        />,
      );

      expect(screen.getByLabelText("Model ID")).toBeDisabled();
      expect(screen.getByLabelText("Endpoint")).toBeDisabled();
      expect(screen.getByLabelText("新 API Key（必填）")).toBeDisabled();
      expect(screen.getByRole("button", { name: "保存草稿" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "测试并启用" })).toBeDisabled();
    },
  );
});
