import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MobileNavigation } from "./mobile-navigation";
import type { PortalNavigationItem } from "./navigation-types";

const items: PortalNavigationItem[] = [
  {
    label: "产品",
    href: "/product",
    children: [
      {
        label: "平台",
        items: [
          {
            label: "Agent Studio",
            href: "/product/agent-studio",
            description: "设计和发布智能体",
          },
          { label: "高级搜索", href: "/product/search?mode=advanced" },
        ],
      },
    ],
  },
  {
    label: "文档",
    href: "/docs",
    children: [
      {
        label: "入门",
        items: [{ label: "快速开始", href: "/docs/getting-started" }],
      },
    ],
  },
  {
    label: "下载",
    href: "/downloads",
    status: "placeholder",
    children: [
      {
        label: "客户端",
        items: [
          {
            label: "桌面客户端",
            href: "/downloads/desktop",
            status: "placeholder",
          },
        ],
      },
    ],
  },
];

function renderNavigation(
  activeHref = "/",
  props?: Partial<{
    actionLabel: string;
    actionHref: string;
    items: PortalNavigationItem[];
  }>,
) {
  return render(
    <MobileNavigation
      activeHref={activeHref}
      items={props?.items ?? items}
      {...props}
    />,
  );
}

function openNavigation() {
  const opener = screen.getByRole("button", { name: "打开导航" });
  fireEvent.click(opener);
  return { dialog: screen.getByRole("dialog"), opener };
}

function accordion(label: string) {
  return screen.getByRole("button", { name: new RegExp(label) });
}

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("MobileNavigation", () => {
  it("renders a closed opener controlling a mounted drawer", () => {
    renderNavigation();

    const opener = screen.getByRole("button", { name: "打开导航" });
    expect(opener).toHaveAttribute("aria-expanded", "false");
    expect(opener).toHaveAttribute("aria-controls");
    expect(
      document.getElementById(opener.getAttribute("aria-controls")!),
    ).toBeInstanceOf(HTMLElement);
  });

  it("opens a labeled modal dialog and renders every supplied group", () => {
    const eightGroups = Array.from({ length: 8 }, (_, index) => ({
      ...items[0],
      label: `分组 ${index + 1}`,
      href: `/group-${index + 1}`,
    }));
    renderNavigation("/", { items: eightGroups });

    openNavigation();
    const dialog = screen.getByRole("dialog", { name: "全站导航" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(
      within(dialog).getAllByRole("button", { name: /分组/ }),
    ).toHaveLength(8);
  });

  it("mounts controlled accordion panels and shows overview before children", () => {
    renderNavigation();
    openNavigation();

    const product = accordion("产品");
    const panel = document.getElementById(
      product.getAttribute("aria-controls")!,
    )!;
    expect(product).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveAttribute("hidden");

    fireEvent.click(product);
    const links = within(panel).getAllByRole("link");
    expect(product).toHaveAttribute("aria-expanded", "true");
    expect(panel).not.toHaveAttribute("hidden");
    expect(links[0]).toHaveAccessibleName(/产品概览/);
    expect(links.map((link) => link.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("Agent Studio")]),
    );
  });

  it("keeps only one accordion open", () => {
    renderNavigation();
    openNavigation();

    fireEvent.click(accordion("产品"));
    fireEvent.click(accordion("文档"));

    expect(accordion("产品")).toHaveAttribute("aria-expanded", "false");
    expect(accordion("文档")).toHaveAttribute("aria-expanded", "true");
  });

  it("moves initial focus to close and traps Tab in visible controls", () => {
    renderNavigation();
    const { dialog } = openNavigation();
    const close = within(dialog).getByRole("button", { name: "关闭导航" });
    const action = within(dialog).getByRole("link", {
      name: "登录 / 进入控制台",
    });
    expect(close).toHaveFocus();

    action.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(close).toHaveFocus();

    close.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(action).toHaveFocus();
  });

  it("closes on Escape and returns focus to the opener", () => {
    renderNavigation();
    const { opener } = openNavigation();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(opener).toHaveAttribute("aria-expanded", "false");
    expect(opener).toHaveFocus();
  });

  it("closes only from the overlay itself, not a drawer pointer event", () => {
    renderNavigation();
    const { dialog, opener } = openNavigation();
    const overlay = dialog.parentElement!;

    fireEvent.pointerDown(dialog);
    expect(opener).toHaveAttribute("aria-expanded", "true");

    fireEvent.pointerDown(overlay);
    expect(opener).toHaveAttribute("aria-expanded", "false");
    expect(opener).toHaveFocus();
  });

  it("closes from overview and child navigation links", () => {
    const preventNavigation = (event: MouseEvent) => event.preventDefault();
    document.addEventListener("click", preventNavigation);
    renderNavigation();
    const { opener } = openNavigation();
    fireEvent.click(accordion("产品"));
    fireEvent.click(screen.getByRole("link", { name: /产品概览/ }));
    expect(opener).toHaveAttribute("aria-expanded", "false");
    expect(opener).toHaveFocus();

    fireEvent.click(opener);
    fireEvent.click(accordion("产品"));
    fireEvent.click(screen.getByRole("link", { name: /Agent Studio/ }));
    expect(opener).toHaveAttribute("aria-expanded", "false");
    expect(opener).toHaveFocus();
    document.removeEventListener("click", preventNavigation);
  });

  it("locks body overflow and restores its exact value on close and unmount", () => {
    document.body.style.overflow = "clip";
    const { unmount } = renderNavigation();
    const { opener } = openNavigation();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(screen.getByRole("button", { name: "关闭导航" }));
    expect(document.body.style.overflow).toBe("clip");

    fireEvent.click(opener);
    unmount();
    expect(document.body.style.overflow).toBe("clip");
  });

  it("keeps a configurable fixed action present while open", () => {
    renderNavigation("/", {
      actionLabel: "进入工作台",
      actionHref: "/workspace",
    });
    const { dialog } = openNavigation();

    expect(
      within(dialog).getByRole("link", { name: "进入工作台" }),
    ).toHaveAttribute("href", "/workspace");
  });

  it("marks exact child and segment-safe parent current state", () => {
    const { rerender } = renderNavigation("/product/agent-studio");
    openNavigation();
    expect(accordion("产品")).toHaveAttribute("aria-current", "page");
    fireEvent.click(accordion("产品"));
    expect(screen.getByRole("link", { name: /Agent Studio/ })).toHaveAttribute(
      "aria-current",
      "page",
    );

    rerender(<MobileNavigation activeHref="/productivity" items={items} />);
    expect(accordion("产品")).not.toHaveAttribute("aria-current");
  });

  it("shows placeholder statuses on groups and child links", () => {
    renderNavigation();
    const { dialog } = openNavigation();
    expect(within(accordion("下载")).getByText("尚未开放")).toBeVisible();

    fireEvent.click(accordion("下载"));
    const desktop = within(dialog).getByRole("link", { name: /桌面客户端/ });
    expect(within(desktop).getByText("尚未开放")).toBeVisible();
  });
});
