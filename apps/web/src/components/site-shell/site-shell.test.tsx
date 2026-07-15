import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockAppShellProps = {
  activeHref: string;
  adminNavigation: unknown;
  children: ComponentProps<"div">["children"];
  consoleNavigation: unknown;
  footerNavigation: unknown;
  portalNavigation: unknown;
  variant: string;
  assistantEntry?: ReactNode;
  adminBreadcrumb?: readonly { label: string; href?: string }[];
  administratorDisplayName?: string;
  environmentStatus?: string;
  grantedPermissions?: readonly string[];
  logoutAction?: () => Promise<void>;
};

const mocks = vi.hoisted(() => ({
  appShellProps: undefined as MockAppShellProps | undefined,
  assistantEntryOpen: undefined as boolean | undefined,
  pathname: "/",
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

vi.mock("@/server/auth/server-actions", () => ({
  customerLogoutAction: vi.fn(),
  staffLogoutAction: vi.fn(),
}));

vi.mock("../assistant/use-assistant-session", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../assistant/use-assistant-session")>();
  return { ...actual, useAssistantSession: vi.fn(actual.useAssistantSession) };
});

vi.mock("@ai-agent-platform/ui", () => ({
  AppShell: (props: MockAppShellProps) => {
    mocks.appShellProps = props;

    return (
      <div
        data-active-href={props.activeHref}
        data-testid="app-shell"
        data-variant={props.variant}
      >
        {props.assistantEntry}
        {props.children}
      </div>
    );
  },
  AssistantHeaderEntry: ({
    isOpen,
    onActivate,
  }: {
    isOpen: boolean;
    onActivate: () => void;
  }) => (
    <button
      data-open={String((mocks.assistantEntryOpen = isOpen))}
      onClick={onActivate}
      type="button"
    >
      打开 AI 助理
    </button>
  ),
}));

import {
  adminNavigation,
  consoleNavigation,
  footerNavigation,
  portalNavigation,
} from "../../config/navigation";
import { useAssistantSession } from "../assistant/use-assistant-session";
import { SiteShell } from "./site-shell";

function renderAt(pathname: string) {
  mocks.pathname = pathname;
  window.history.replaceState(null, "", pathname);
  return render(
    <SiteShell>
      <p>页面内容</p>
    </SiteShell>,
  );
}

afterEach(cleanup);

beforeEach(() => {
  mocks.appShellProps = undefined;
  mocks.assistantEntryOpen = undefined;
  mocks.pathname = "/";
  mocks.push.mockReset();
  mocks.replace.mockReset();
  vi.mocked(useAssistantSession).mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      const body = url.includes("/staff")
        ? {
            realm: "workforce",
            status: "active",
            displayName: "Operator",
            mustChangePassword: false,
            twoFactorEnabled: true,
            permissions: [],
          }
        : {
            realm: "customer",
            status: "active",
            displayName: "Customer",
            emailVerificationStatus: "verified",
            organization: null,
          };
      return Promise.resolve(
        new Response(JSON.stringify(body), { status: 200 }),
      );
    }),
  );
  window.history.replaceState(null, "", "/");
});

describe("SiteShell", () => {
  it.each([
    ["/", "portal"],
    ["/assistant", "assistant"],
    ["/login", "auth"],
    ["/register", "auth"],
    ["/staff/login", "auth"],
    ["/console/profile", "console"],
    ["/admin/products", "admin"],
    ["/administrator", "portal"],
    ["/console-old", "portal"],
  ])("selects the exact shell for %s", async (pathname, variant) => {
    renderAt(pathname);

    await waitFor(() =>
      expect(screen.getByTestId("app-shell")).toHaveAttribute(
        "data-variant",
        variant,
      ),
    );
  });

  it("passes each exported navigation config to the matching AppShell prop", () => {
    renderAt("/");

    expect(mocks.appShellProps).toMatchObject({
      adminNavigation,
      consoleNavigation,
      footerNavigation,
      portalNavigation,
    });
    expect(mocks.appShellProps?.adminNavigation).toBe(adminNavigation);
    expect(mocks.appShellProps?.consoleNavigation).toBe(consoleNavigation);
    expect(mocks.appShellProps?.footerNavigation).toBe(footerNavigation);
    expect(mocks.appShellProps?.portalNavigation).toBe(portalNavigation);
  });

  it("keeps activeHref synchronized with search, hash, and browser navigation", () => {
    renderAt("/docs");
    expect(screen.getByTestId("app-shell")).toHaveAttribute(
      "data-active-href",
      "/docs",
    );

    act(() => {
      window.history.replaceState(
        null,
        "",
        "/docs?edition=enterprise#deployment",
      );
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(screen.getByTestId("app-shell")).toHaveAttribute(
      "data-active-href",
      "/docs?edition=enterprise#deployment",
    );

    act(() => {
      window.history.replaceState(
        null,
        "",
        "/docs?edition=community#quick-start",
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByTestId("app-shell")).toHaveAttribute(
      "data-active-href",
      "/docs?edition=community#quick-start",
    );
  });

  it("loads an admin session without caching and passes only granted permissions", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          realm: "workforce",
          status: "active",
          permissions: ["admin:products"],
          displayName: "Operator",
          mustChangePassword: false,
          twoFactorEnabled: true,
        }),
        { status: 200 },
      ),
    );

    renderAt("/admin/products");
    expect(screen.getByRole("status")).toHaveTextContent("正在验证工作区会话");

    await waitFor(() => expect(screen.getByTestId("app-shell")).toBeVisible());
    expect(fetch).toHaveBeenCalledWith("/api/v1/session/staff", {
      cache: "no-store",
      credentials: "same-origin",
      signal: expect.any(AbortSignal),
    });
    expect(mocks.appShellProps?.grantedPermissions).toEqual(["admin:products"]);
    expect(mocks.appShellProps?.administratorDisplayName).toBe("Operator");
    expect(mocks.appShellProps?.adminBreadcrumb).toEqual([
      { label: "运营后台", href: "/admin" },
      { label: "产品内容" },
    ]);
    expect(mocks.appShellProps?.environmentStatus).toBe("开发环境");
    expect(mocks.appShellProps?.logoutAction).toEqual(expect.any(Function));
  });

  it("fails closed while a new admin access cycle validates a different actor", async () => {
    const workforceResponse = (displayName: string, permission: string) =>
      new Response(
        JSON.stringify({
          realm: "workforce",
          status: "active",
          permissions: [permission],
          displayName,
          mustChangePassword: false,
          twoFactorEnabled: true,
        }),
        { status: 200 },
      );
    vi.mocked(fetch).mockResolvedValueOnce(
      workforceResponse("管理员 A", "admin:products"),
    );
    const view = renderAt("/admin/products");
    await waitFor(() =>
      expect(mocks.appShellProps?.administratorDisplayName).toBe("管理员 A"),
    );

    mocks.pathname = "/staff/login";
    view.rerender(<SiteShell>员工登录</SiteShell>);
    expect(screen.getByTestId("app-shell")).toHaveAttribute(
      "data-variant",
      "auth",
    );

    let resolveB!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveB = resolve;
      }),
    );
    mocks.pathname = "/admin/products";
    view.rerender(<SiteShell>后台 B</SiteShell>);

    expect(screen.getByRole("status")).toHaveTextContent("正在验证工作区会话");
    expect(screen.queryByTestId("app-shell")).toBeNull();
    expect(screen.queryByText("管理员 A")).toBeNull();

    await act(async () =>
      resolveB(workforceResponse("管理员 B", "admin:users")),
    );
    await waitFor(() =>
      expect(mocks.appShellProps?.administratorDisplayName).toBe("管理员 B"),
    );
    expect(mocks.appShellProps?.grantedPermissions).toEqual(["admin:users"]);
    expect(mocks.appShellProps?.grantedPermissions).not.toContain(
      "admin:products",
    );
  });

  it("aborts a departed access cycle and ignores its late response", async () => {
    const workforceResponse = (displayName: string) =>
      new Response(
        JSON.stringify({
          realm: "workforce",
          status: "active",
          permissions: [],
          displayName,
          mustChangePassword: false,
          twoFactorEnabled: true,
        }),
        { status: 200 },
      );
    let resolveA!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveA = resolve;
      }),
    );
    const view = renderAt("/admin/products");
    const departedSignal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;

    mocks.pathname = "/staff/login";
    view.rerender(<SiteShell>员工登录</SiteShell>);
    expect(departedSignal?.aborted).toBe(true);

    vi.mocked(fetch).mockResolvedValueOnce(workforceResponse("管理员 B"));
    mocks.pathname = "/admin/products";
    view.rerender(<SiteShell>后台 B</SiteShell>);
    await waitFor(() =>
      expect(mocks.appShellProps?.administratorDisplayName).toBe("管理员 B"),
    );

    await act(async () => resolveA(workforceResponse("过期管理员 A")));
    expect(mocks.appShellProps?.administratorDisplayName).toBe("管理员 B");
    expect(screen.queryByText("过期管理员 A")).toBeNull();
  });

  it.each([
    ["missing fields", {}],
    ["null", null],
    ["array", []],
    [
      "wrong realm",
      {
        realm: "customer",
        status: "active",
        displayName: "Operator",
        mustChangePassword: false,
        twoFactorEnabled: true,
        permissions: [],
      },
    ],
    [
      "unknown permission",
      {
        realm: "workforce",
        status: "active",
        displayName: "Operator",
        mustChangePassword: false,
        twoFactorEnabled: true,
        permissions: ["admin:unknown"],
      },
    ],
  ])(
    "fails closed for a malformed admin session payload: %s",
    async (_label, body) => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify(body), { status: 200 }),
      );

      renderAt("/admin/products");

      await waitFor(() =>
        expect(mocks.replace).toHaveBeenCalledWith(
          "/staff/login?returnTo=%2Fadmin%2Fproducts",
        ),
      );
      expect(screen.queryByTestId("app-shell")).not.toBeInTheDocument();
    },
  );

  it("fails closed for a wrong-realm customer session payload", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          realm: "workforce",
          status: "active",
          displayName: "Wrong realm",
        }),
        { status: 200 },
      ),
    );

    renderAt("/console/profile");

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/login?returnTo=%2Fconsole%2Fprofile",
      ),
    );
    expect(screen.queryByTestId("app-shell")).not.toBeInTheDocument();
  });

  it.each([
    [
      "/console/profile",
      "/api/v1/session/customer",
      "/login?returnTo=%2Fconsole%2Fprofile",
    ],
    [
      "/admin/products",
      "/api/v1/session/staff",
      "/staff/login?returnTo=%2Fadmin%2Fproducts",
    ],
  ] as const)(
    "redirects a 401 for %s to its own realm",
    async (pathname, endpoint, login) => {
      vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));

      renderAt(pathname);

      await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(login));
      expect(fetch).toHaveBeenCalledWith(
        endpoint,
        expect.objectContaining({
          credentials: "same-origin",
          cache: "no-store",
        }),
      );
    },
  );

  it("never fetches a session for the public portal", () => {
    renderAt("/docs");
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByTestId("app-shell")).toBeVisible();
  });

  it.each([
    "/login",
    "/register",
    "/staff/login",
    "/console/profile",
    "/admin/products",
  ])(
    "does not initialize assistant state for the %s shell",
    async (pathname) => {
      renderAt(pathname);
      if (pathname.startsWith("/console") || pathname.startsWith("/admin")) {
        await waitFor(() =>
          expect(screen.getByTestId("app-shell")).toBeVisible(),
        );
      }
      expect(useAssistantSession).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "打开 M 助手" })).toBeNull();
      expect(screen.queryByRole("button", { name: "打开 AI 助理" })).toBeNull();
    },
  );

  it("gives portal routes a shared top entry and floating launcher", () => {
    renderAt("/pricing");

    expect(useAssistantSession).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "打开 AI 助理" })).toBeVisible();
    expect(screen.getByRole("button", { name: "打开 M 助手" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "打开 AI 助理" }),
    ).toHaveAttribute("data-open", "false");

    fireEvent.click(screen.getByRole("button", { name: "打开 M 助手" }));
    expect(
      screen.getByRole("button", { name: "打开 AI 助理" }),
    ).toHaveAttribute("data-open", "true");
  });

  it("routes the portal assistant entry to the full assistant workspace", () => {
    renderAt("/");

    fireEvent.click(screen.getByRole("button", { name: "打开 AI 助理" }));

    expect(mocks.push).toHaveBeenCalledWith("/assistant");
  });

  it("gives the assistant workspace a top focus entry without a floating launcher", () => {
    renderAt("/assistant");

    expect(useAssistantSession).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "打开 AI 助理" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "打开 AI 助理" }),
    ).toHaveAttribute("data-open", "false");
    expect(screen.queryByRole("button", { name: "打开 M 助手" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "打开 AI 助理" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("returns focus to the exact portal launcher that opened the drawer", () => {
    renderAt("/");
    const floating = screen.getByRole("button", { name: "打开 M 助手" });

    fireEvent.click(floating);
    fireEvent.click(screen.getByRole("button", { name: "关闭 M 助手" }));
    expect(floating).toHaveFocus();
  });

  it("preserves the assistant controller across pathname rerenders", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          version: "1",
          requestId: "req-1",
          mode: "placeholder",
          session: {
            temporary: true,
            expiresAt: "2026-07-13T12:00:00.000Z",
          },
          message: {
            id: "msg-1",
            role: "assistant",
            content: "保留回答",
          },
          suggestedActions: [],
        }),
      ),
    );
    const view = renderAt("/");
    fireEvent.click(screen.getByRole("button", { name: "打开 M 助手" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "保留问题" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));
    await waitFor(() =>
      expect(screen.getByTestId("assistant-history")).toHaveTextContent(
        "保留回答",
      ),
    );

    mocks.pathname = "/assistant";
    view.rerender(
      <SiteShell>
        <p>助理工作区</p>
      </SiteShell>,
    );
    expect(screen.queryByRole("button", { name: "打开 M 助手" })).toBeNull();
    mocks.pathname = "/pricing";
    view.rerender(
      <SiteShell>
        <p>价格页</p>
      </SiteShell>,
    );
    expect(screen.getByTestId("assistant-history")).toHaveTextContent(
      "保留回答",
    );
  });

  it("discards assistant state after crossing into a non-assistant shell", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          version: "1",
          requestId: "req-1",
          mode: "placeholder",
          session: {
            temporary: true,
            expiresAt: "2026-07-13T12:00:00.000Z",
          },
          message: {
            id: "msg-1",
            role: "assistant",
            content: "旧回答",
          },
          suggestedActions: [],
        }),
      ),
    );
    const view = renderAt("/");
    fireEvent.click(screen.getByRole("button", { name: "打开 M 助手" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "旧问题" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));
    await waitFor(() =>
      expect(screen.getByTestId("assistant-history")).toHaveTextContent(
        "旧回答",
      ),
    );

    mocks.pathname = "/login";
    view.rerender(<SiteShell>登录页</SiteShell>);
    mocks.pathname = "/";
    view.rerender(<SiteShell>首页</SiteShell>);
    fireEvent.click(screen.getByRole("button", { name: "打开 M 助手" }));
    expect(screen.queryByText("旧回答")).toBeNull();
  });

  it("aborts an in-flight session request when the shell unmounts", () => {
    vi.mocked(fetch).mockImplementation(
      () => new Promise<Response>(() => undefined),
    );
    const { unmount } = renderAt("/admin/products");
    const signal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;

    unmount();

    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(true);
  });
});
