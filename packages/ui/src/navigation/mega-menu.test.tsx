import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavigationStatusBadge } from "../index";
import { MegaMenu } from "./mega-menu";
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
          {
            label: "高级搜索",
            href: "/product/search?mode=advanced",
          },
        ],
      },
      {
        label: "指南",
        items: [
          { label: "配置指南", href: "/product/guide#setup" },
          { label: "路线图", href: "/product/roadmap" },
        ],
      },
      { label: "解决方案", items: [] },
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
      { label: "参考", items: [] },
      { label: "资源", items: [] },
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
      { label: "工具", items: [] },
      { label: "其他", items: [] },
    ],
  },
];

function renderMenu(activeHref = "/") {
  return render(<MegaMenu items={items} activeHref={activeHref} />);
}

function trigger(name: string) {
  return screen.getByRole("button", { name: new RegExp(name) });
}

describe("MegaMenu", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("renders closed button triggers wired to controlled panels", () => {
    renderMenu();

    for (const label of ["产品", "文档", "下载"]) {
      const button = trigger(label);
      expect(button).toHaveAttribute("aria-expanded", "false");
      expect(button).toHaveAttribute("aria-controls");
      expect(
        document.getElementById(button.getAttribute("aria-controls")!),
      ).toBeInstanceOf(HTMLElement);
    }
  });

  it("opens a panel on click and shows its overview and child links", () => {
    renderMenu();

    fireEvent.click(trigger("产品"));

    expect(trigger("产品")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /产品概览/ })).toHaveAttribute(
      "href",
      "/product",
    );
    expect(screen.getByRole("link", { name: /Agent Studio/ })).toBeVisible();
  });

  it("opens on pointer enter", () => {
    renderMenu();

    fireEvent.pointerEnter(trigger("文档"));

    expect(trigger("文档")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /快速开始/ })).toBeVisible();
  });

  it("promotes a hover-open panel on first click before toggling closed", () => {
    renderMenu();
    const productTrigger = trigger("产品");

    fireEvent.pointerEnter(productTrigger);
    fireEvent.click(productTrigger);
    expect(productTrigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(productTrigger);
    expect(productTrigger).toHaveAttribute("aria-expanded", "false");
  });

  it("resets hover-open promotion after a delayed close and re-entry", () => {
    renderMenu();
    const productTrigger = trigger("产品");
    fireEvent.pointerEnter(productTrigger);
    fireEvent.pointerLeave(productTrigger);
    act(() => vi.advanceTimersByTime(180));

    fireEvent.pointerEnter(productTrigger);
    fireEvent.click(productTrigger);
    expect(productTrigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.pointerLeave(productTrigger);
    fireEvent.pointerEnter(productTrigger);
    act(() => vi.advanceTimersByTime(180));
    expect(productTrigger).toHaveAttribute("aria-expanded", "true");
  });

  it("delays pointer-leave closing for 180ms and cancels it on re-entry", () => {
    renderMenu();
    const productTrigger = trigger("产品");
    fireEvent.pointerEnter(productTrigger);
    fireEvent.pointerLeave(productTrigger);

    act(() => vi.advanceTimersByTime(179));
    expect(productTrigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.pointerEnter(productTrigger);
    act(() => vi.advanceTimersByTime(1));
    expect(productTrigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.pointerLeave(productTrigger);
    act(() => vi.advanceTimersByTime(180));
    expect(productTrigger).toHaveAttribute("aria-expanded", "false");
  });

  it("switches directly between triggers and keeps only one panel open", () => {
    renderMenu();
    fireEvent.click(trigger("产品"));
    fireEvent.click(trigger("文档"));

    expect(trigger("产品")).toHaveAttribute("aria-expanded", "false");
    expect(trigger("文档")).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("link", { name: /Agent Studio/ })).toBeNull();
    expect(screen.getAllByRole("region")).toHaveLength(1);
  });

  it("closes on an outside document pointerdown", () => {
    renderMenu();
    fireEvent.click(trigger("产品"));

    fireEvent.pointerDown(document.body);

    expect(trigger("产品")).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on Escape and restores focus to the open trigger", () => {
    renderMenu();
    const productTrigger = trigger("产品");
    fireEvent.click(productTrigger);
    screen.getByRole("link", { name: /Agent Studio/ }).focus();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(productTrigger).toHaveAttribute("aria-expanded", "false");
    expect(productTrigger).toHaveFocus();
  });

  it("wraps trigger focus with ArrowRight and ArrowLeft", () => {
    renderMenu();
    const productTrigger = trigger("产品");
    const downloadTrigger = trigger("下载");
    downloadTrigger.focus();

    fireEvent.keyDown(downloadTrigger, { key: "ArrowRight" });
    expect(productTrigger).toHaveFocus();

    fireEvent.keyDown(productTrigger, { key: "ArrowLeft" });
    expect(downloadTrigger).toHaveFocus();
  });

  it("opens with ArrowDown and focuses the first overview link", () => {
    renderMenu();
    const productTrigger = trigger("产品");
    productTrigger.focus();

    fireEvent.keyDown(productTrigger, { key: "ArrowDown" });

    expect(trigger("产品")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /产品概览/ })).toHaveFocus();
  });

  it("focuses the first overview link with ArrowDown when already open", () => {
    renderMenu();
    const productTrigger = trigger("产品");
    fireEvent.click(productTrigger);
    productTrigger.focus();

    fireEvent.keyDown(productTrigger, { key: "ArrowDown" });

    expect(screen.getByRole("link", { name: /产品概览/ })).toHaveFocus();
  });

  it("labels placeholder parents and children as 尚未开放", () => {
    renderMenu();
    expect(within(trigger("下载")).getByText("尚未开放")).toBeVisible();

    fireEvent.click(trigger("下载"));

    const child = screen.getByRole("link", { name: /桌面客户端/ });
    expect(within(child).getByText("尚未开放")).toBeVisible();
  });

  it("marks the current parent and exact child from activeHref", () => {
    renderMenu("/product/agent-studio");

    expect(trigger("产品")).toHaveAttribute("aria-current", "page");
    fireEvent.click(trigger("产品"));
    expect(screen.getByRole("link", { name: /Agent Studio/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("uses segment-safe parent matching", () => {
    renderMenu("/productivity");

    expect(trigger("产品")).not.toHaveAttribute("aria-current");
  });

  it("requires configured query and hash constraints for child activity", () => {
    const { rerender } = renderMenu("/product/search?mode=basic");
    fireEvent.click(trigger("产品"));
    expect(screen.getByRole("link", { name: /高级搜索/ })).not.toHaveAttribute(
      "aria-current",
    );

    rerender(
      <MegaMenu items={items} activeHref="/product/search?mode=advanced" />,
    );
    expect(screen.getByRole("link", { name: /高级搜索/ })).toHaveAttribute(
      "aria-current",
      "page",
    );

    rerender(<MegaMenu items={items} activeHref="/product/guide#other" />);
    expect(screen.getByRole("link", { name: /配置指南/ })).not.toHaveAttribute(
      "aria-current",
    );

    rerender(<MegaMenu items={items} activeHref="/product/guide#setup" />);
    expect(screen.getByRole("link", { name: /配置指南/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("requires an exact normalized full href for child activity", () => {
    const { rerender } = renderMenu("/product/agent-studio?foo=1");
    fireEvent.click(trigger("产品"));
    const agentStudio = screen.getByRole("link", { name: /Agent Studio/ });
    expect(agentStudio).not.toHaveAttribute("aria-current");

    rerender(<MegaMenu items={items} activeHref="/product/agent-studio#bar" />);
    expect(agentStudio).not.toHaveAttribute("aria-current");

    rerender(<MegaMenu items={items} activeHref="/product/agent-studio" />);
    expect(agentStudio).toHaveAttribute("aria-current", "page");
  });

  it("uses exactly three or four panel columns and caps five sections at four", () => {
    const { rerender } = renderMenu();
    fireEvent.click(trigger("产品"));
    expect(screen.getByRole("region")).toHaveClass("mega-menu__panel--3");

    const fiveSectionItems: PortalNavigationItem[] = [
      {
        ...items[0],
        children: [
          ...items[0].children,
          { label: "生态", items: [] },
          { label: "服务", items: [] },
        ],
      },
    ];
    rerender(<MegaMenu items={fiveSectionItems} activeHref="/" />);

    expect(screen.getByRole("region")).toHaveClass("mega-menu__panel--4");
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(5);
  });

  it("exports a reusable placeholder status badge", () => {
    const { rerender } = render(<NavigationStatusBadge status="placeholder" />);
    expect(screen.getByText("尚未开放")).toBeVisible();

    rerender(<NavigationStatusBadge status="live" />);
    expect(screen.queryByText("尚未开放")).toBeNull();
  });
});
