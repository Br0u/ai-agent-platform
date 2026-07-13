import type { NavigationLinkProps } from "@ai-agent-platform/ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PortalNavigationLink } from "./portal-navigation-link";

vi.mock("next/link", () => ({
  default: ({ href, ...props }: NavigationLinkProps) => (
    <a data-next-link="true" href={href} {...props} />
  ),
}));

afterEach(cleanup);

describe("PortalNavigationLink", () => {
  it("uses Next Link for same-origin application paths", () => {
    render(
      <PortalNavigationLink href="/docs#quick-start">
        快速开始
      </PortalNavigationLink>,
    );

    expect(screen.getByRole("link", { name: "快速开始" })).toHaveAttribute(
      "data-next-link",
      "true",
    );
  });

  it.each(["https://example.com/docs", "//cdn.example.com/asset"])(
    "uses a native anchor for external href %s",
    (href) => {
      render(
        <PortalNavigationLink href={href} rel="noreferrer" target="_blank">
          外部资源
        </PortalNavigationLink>,
      );

      const link = screen.getByRole("link", { name: "外部资源" });
      expect(link).not.toHaveAttribute("data-next-link");
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noreferrer");
    },
  );

  it("preserves modified-click and anchor attributes", () => {
    const onClick = vi.fn((event: React.MouseEvent<HTMLAnchorElement>) => {
      expect(event.defaultPrevented).toBe(false);
      expect(event.metaKey).toBe(true);
    });
    render(
      <PortalNavigationLink
        download="guide.pdf"
        href="/docs"
        onClick={onClick}
        target="_blank"
      >
        下载文档
      </PortalNavigationLink>,
    );

    const link = screen.getByRole("link", { name: "下载文档" });
    fireEvent.click(link, { metaKey: true });
    expect(onClick).toHaveBeenCalledOnce();
    expect(link).toHaveAttribute("download", "guide.pdf");
  });
});
