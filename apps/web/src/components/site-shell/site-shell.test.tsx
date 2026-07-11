import { act, cleanup, render, screen } from "@testing-library/react";
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
};

const mocks = vi.hoisted(() => ({
  appShellProps: undefined as MockAppShellProps | undefined,
  pathname: "/",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
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
  window.history.replaceState(null, "", "/");
});

describe("SiteShell", () => {
  it.each([
    ["/", "portal"],
    ["/console/profile", "console"],
    ["/admin/products", "admin"],
    ["/administrator", "portal"],
    ["/console-old", "portal"],
  ])("selects the exact shell for %s", (pathname, variant) => {
    renderAt(pathname);

    expect(screen.getByTestId("app-shell")).toHaveAttribute(
      "data-variant",
      variant,
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
});
