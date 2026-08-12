import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminInputPolicySnapshot } from "@/features/assistant/admin-input-policy-contract";
import { AssistantInputPolicyPanel } from "./assistant-input-policy-panel";

const snapshot = (
  overrides: Partial<AdminInputPolicySnapshot> = {},
): AdminInputPolicySnapshot => ({
  version: "1",
  revision: 3,
  termCount: 2,
  terms: ["example", "敏感"],
  updatedAt: "2026-08-12T01:02:03.000Z",
  canConfigure: true,
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AssistantInputPolicyPanel", () => {
  it("renders one-term-per-line editing with live normalized counters", () => {
    render(<AssistantInputPolicyPanel initialSnapshot={snapshot()} />);

    expect(screen.getByRole("heading", { name: "输入内容规则" })).toBeVisible();
    expect(screen.getByLabelText("屏蔽词（一行一个）")).toHaveValue(
      "example\n敏感",
    );
    expect(screen.getByText("当前版本 3")).toBeVisible();
    expect(screen.getByText("已配置 2 个屏蔽词")).toBeVisible();
    expect(screen.getByText("更新时间 2026-08-12T01:02:03.000Z")).toBeVisible();
    expect(screen.getByText(/NFKC.*不区分大小写.*连续子串/u)).toBeVisible();
    expect(screen.getByText(/不记录用户输入原文/u)).toBeVisible();

    fireEvent.change(screen.getByLabelText("屏蔽词（一行一个）"), {
      target: { value: " Example \nexample\n敏感\n\n" },
    });

    expect(screen.getByText("有效 2")).toBeVisible();
    expect(screen.getByText("重复 1")).toBeVisible();
    expect(screen.getByText("空行 2")).toBeVisible();
  });

  it("keeps terms hidden and save disabled for read-only administrators", () => {
    render(
      <AssistantInputPolicyPanel
        initialSnapshot={snapshot({
          termCount: 2,
          terms: undefined,
          canConfigure: false,
        })}
      />,
    );

    expect(screen.getByText("更新时间 2026-08-12T01:02:03.000Z")).toBeVisible();
    expect(screen.getByLabelText("屏蔽词（一行一个）")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "保存并立即生效" }),
    ).toBeDisabled();
    expect(screen.queryByDisplayValue(/example|敏感/u)).not.toBeInTheDocument();
  });

  it("adopts the PUT snapshot without a follow-up GET", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        snapshot({
          revision: 4,
          termCount: 2,
          terms: ["example", "新词"],
          updatedAt: "2026-08-12T02:03:04.000Z",
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantInputPolicyPanel initialSnapshot={snapshot()} />);
    fireEvent.change(screen.getByLabelText("屏蔽词（一行一个）"), {
      target: { value: "Example\n新词" },
    });

    fireEvent.click(screen.getByRole("button", { name: "保存并立即生效" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/assistant/input-policy",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          source: "Example\n新词",
          expectedRevision: 3,
        }),
      }),
    );
    expect(await screen.findByText("内容规则已保存。"));
    expect(screen.getByText("当前版本 4")).toBeVisible();
    expect(screen.getByLabelText("屏蔽词（一行一个）")).toHaveValue(
      "example\n新词",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retains the edited source and announces a newer revision on conflict", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            version: "1",
            requestId: "request-1",
            error: {
              code: "configuration_conflict",
              message: "raw private detail",
              retryable: false,
            },
          },
          { status: 409 },
        ),
      ),
    );
    render(<AssistantInputPolicyPanel initialSnapshot={snapshot()} />);
    const textarea = screen.getByLabelText("屏蔽词（一行一个）");
    fireEvent.change(textarea, { target: { value: "保留这次编辑" } });
    fireEvent.click(screen.getByRole("button", { name: "保存并立即生效" }));

    expect(
      await screen.findByText(
        "服务器存在更新版本，请保留当前编辑并刷新页面后重试。",
      ),
    ).toBeVisible();
    expect(textarea).toHaveValue("保留这次编辑");
    expect(document.body.textContent).not.toContain("raw private detail");
  });

  it("adopts matching terms as a committed unknown outcome", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          version: "1",
          revision: 4,
          termCount: 1,
          updatedAt: "2026-08-12T02:03:04.000Z",
          canConfigure: false,
        }),
      )
      .mockResolvedValueOnce(
        Response.json(
          snapshot({
            revision: 4,
            termCount: 1,
            terms: ["example"],
            updatedAt: "2026-08-12T02:03:04.000Z",
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantInputPolicyPanel initialSnapshot={snapshot()} />);
    const textarea = screen.getByLabelText("屏蔽词（一行一个）");
    fireEvent.change(textarea, { target: { value: " Ｅxample \nexample" } });
    fireEvent.click(screen.getByRole("button", { name: "保存并立即生效" }));

    expect(await screen.findByText("内容规则已保存。")).toBeVisible();
    expect(screen.getByText("当前版本 4")).toBeVisible();
    expect(textarea).toHaveValue("example");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the original revision when reconciliation shows no commit", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce(Response.json(snapshot()))
      .mockResolvedValueOnce(
        Response.json(
          snapshot({ revision: 4, termCount: 1, terms: ["保留这次编辑"] }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantInputPolicyPanel initialSnapshot={snapshot()} />);
    const textarea = screen.getByLabelText("屏蔽词（一行一个）");
    fireEvent.change(textarea, { target: { value: "保留这次编辑" } });
    fireEvent.click(screen.getByRole("button", { name: "保存并立即生效" }));

    expect(
      await screen.findByText(
        "服务器未保存本次修改，当前编辑已保留，可以重试。",
      ),
    ).toBeVisible();
    expect(textarea).toHaveValue("保留这次编辑");
    expect(screen.getByText("当前版本 3")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "保存并立即生效" }),
    ).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "保存并立即生效" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/v1/admin/assistant/input-policy",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          source: "保留这次编辑",
          expectedRevision: 3,
        }),
      }),
    );
  });

  it("locks saving when an advanced snapshot contains different terms", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce(
        Response.json(
          snapshot({
            revision: 4,
            termCount: 1,
            terms: ["他人修改"],
            updatedAt: "2026-08-12T02:03:04.000Z",
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantInputPolicyPanel initialSnapshot={snapshot()} />);
    const textarea = screen.getByLabelText("屏蔽词（一行一个）");
    fireEvent.change(textarea, { target: { value: "保留这次编辑" } });
    fireEvent.click(screen.getByRole("button", { name: "保存并立即生效" }));

    expect(
      await screen.findByText(
        "检测到其他管理员已更新规则，当前编辑已保留；请刷新页面并手动合并后再保存。",
      ),
    ).toBeVisible();
    expect(textarea).toHaveValue("保留这次编辑");
    expect(screen.getByText("当前版本 3")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "保存并立即生效" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "保存并立即生效" }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("disables saving when an unknown outcome cannot be reconciled", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantInputPolicyPanel initialSnapshot={snapshot()} />);
    fireEvent.change(screen.getByLabelText("屏蔽词（一行一个）"), {
      target: { value: "保留这次编辑" },
    });

    fireEvent.click(screen.getByRole("button", { name: "保存并立即生效" }));

    expect(
      await screen.findByText("无法确认保存结果，请刷新页面后再继续。"),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "保存并立即生效" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("屏蔽词（一行一个）")).toHaveValue(
      "保留这次编辑",
    );
  });
});
