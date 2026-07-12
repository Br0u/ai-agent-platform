import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ permissions: [] }), { status: 200 }),
      ),
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
          permissions: ["admin:products"],
          displayName: "Operator",
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
