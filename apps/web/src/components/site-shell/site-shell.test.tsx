import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockAppShellProps = {
  activeHref: string;
  adminNavigation: unknown;
  children: ComponentProps<"div">["children"];
  consoleNavigation: unknown;
  footerNavigation: unknown;
  portalNavigation: unknown;
  variant: string;
  grantedPermissions?: readonly string[];
  logoutAction?: () => Promise<void>;
};

const mocks = vi.hoisted(() => ({
  appShellProps: undefined as MockAppShellProps | undefined,
  pathname: "/",
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@/server/auth/server-actions", () => ({
  customerLogoutAction: vi.fn(),
  staffLogoutAction: vi.fn(),
}));

vi.mock("@ai-agent-platform/ui", () => ({
  AppShell: (props: MockAppShellProps) => {
    mocks.appShellProps = props;

    return (
      <div
        data-active-href={props.activeHref}
        data-testid="app-shell"
        data-variant={props.variant}
      >
        {props.children}
      </div>
    );
  },
}));

import {
  adminNavigation,
  consoleNavigation,
  footerNavigation,
  portalNavigation,
} from "../../config/navigation";
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
  mocks.pathname = "/";
  mocks.replace.mockReset();
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
    expect(mocks.appShellProps?.logoutAction).toEqual(expect.any(Function));
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
    ["/", true],
    ["/pricing", true],
    ["/product/agent-studio", true],
    ["/login", false],
    ["/console/profile", false],
    ["/admin/products", false],
  ])(
    "shows the assistant only where allowed: %s",
    async (pathname, visible) => {
      renderAt(pathname);
      if (pathname.startsWith("/console") || pathname.startsWith("/admin")) {
        await waitFor(() =>
          expect(screen.getByTestId("app-shell")).toBeVisible(),
        );
      }
      expect(
        screen.queryByRole("button", { name: "打开 M 助手" }) !== null,
      ).toBe(visible);
    },
  );

  it("preserves the assistant controller across pathname rerenders", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          mode: "placeholder",
          message: "保留回答",
          suggestedActions: [],
        }),
      ),
    );
    const view = renderAt("/");
    fireEvent.click(screen.getByRole("button", { name: "打开 M 助手" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "保留问题" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() =>
      expect(screen.getByTestId("assistant-history")).toHaveTextContent(
        "保留回答",
      ),
    );

    mocks.pathname = "/login";
    view.rerender(
      <SiteShell>
        <p>登录页</p>
      </SiteShell>,
    );
    expect(
      screen.queryByRole("button", { name: "打开 M 助手" }),
    ).not.toBeInTheDocument();
    mocks.pathname = "/pricing";
    view.rerender(
      <SiteShell>
        <p>价格页</p>
      </SiteShell>,
    );
    fireEvent.click(screen.getByRole("button", { name: "打开 M 助手" }));
    expect(screen.getByTestId("assistant-history")).toHaveTextContent(
      "保留回答",
    );
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
