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
    label: "首页",
    href: "/",
    children: [],
  },
  {
    label: "产品",
    href: "/product",
    description: "覆盖企业 AI 全生命周期的一站式能力地图。",
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
  {
    label: "合作伙伴",
    href: "/partners",
    children: [
      {
        label: "商业模式",
        items: [{ label: "合作模式", href: "/partners#business-modes" }],
      },
      {
        label: "伙伴政策",
        items: [{ label: "认证体系", href: "/partners#policy-cert" }],
      },
      {
        label: "伙伴培训",
        items: [{ label: "培训体系", href: "/partners#training-system" }],
      },
      {
        label: "合作对接",
        items: [{ label: "成为合作伙伴", href: "/partners#become" }],
      },
    ],
  },
  { label: "价格与服务", href: "/pricing", children: [] },
];

function renderMenu(activeHref = "/") {
  return render(<MegaMenu items={items} activeHref={activeHref} />);
}

function trigger(name: string) {
  return screen
    .getAllByRole("link", { name: new RegExp(name) })
    .find((link) => link.classList.contains("mega-menu__trigger"))!;
}

describe("MegaMenu", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("renders parent links that point to their overview pages", () => {
    renderMenu();

    for (const [label, href] of [
      ["产品", "/product"],
      ["文档", "/docs"],
      ["下载", "/downloads"],
    ]) {
      const link = trigger(label);
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("aria-expanded", "false");
      expect(link).toHaveAttribute("aria-controls");
      expect(
        document.getElementById(link.getAttribute("aria-controls")!),
      ).toBeInstanceOf(HTMLElement);
    }
  });

  it("renders empty-child parents as direct links without empty panels", () => {
    renderMenu();

    for (const [label, href] of [
      ["首页", "/"],
      ["价格与服务", "/pricing"],
    ]) {
      const direct = trigger(label);
      expect(direct).toHaveAttribute("href", href);
      expect(direct).not.toHaveAttribute("aria-controls");
      expect(direct).not.toHaveAttribute("aria-expanded");
      fireEvent.pointerEnter(direct);
      expect(screen.queryByRole("region", { name: label })).toBeNull();
    }
  });

  it("does not intercept ArrowDown or open a panel for direct parents", () => {
    renderMenu();
    const price = trigger("价格与服务");
    price.focus();

    const result = fireEvent.keyDown(price, { key: "ArrowDown" });

    expect(result).toBe(true);
    expect(price).toHaveFocus();
    expect(price).not.toHaveAttribute("aria-expanded");
    expect(screen.queryByRole("region", { name: "价格与服务" })).toBeNull();
  });

  it("navigates to the parent overview on direct click", () => {
    renderMenu();

    fireEvent.click(trigger("产品"));

    expect(trigger("产品")).toHaveAttribute("href", "/product");
    expect(trigger("产品")).toHaveAttribute("aria-expanded", "false");
  });

  it("opens on pointer enter", () => {
    renderMenu();

    fireEvent.pointerEnter(trigger("文档"));

    expect(trigger("文档")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /快速开始/ })).toBeVisible();
  });

  it("closes a hover-open panel after the pointer leaves", () => {
    renderMenu();
    const productTrigger = trigger("产品");

    fireEvent.pointerEnter(productTrigger);
    expect(productTrigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.pointerLeave(productTrigger);
    act(() => vi.advanceTimersByTime(180));
    expect(productTrigger).toHaveAttribute("aria-expanded", "false");
  });

  it("resets hover-open promotion after a delayed close and re-entry", () => {
    renderMenu();
    const productTrigger = trigger("产品");
    fireEvent.pointerEnter(productTrigger);
    fireEvent.pointerLeave(productTrigger);
    act(() => vi.advanceTimersByTime(180));

    fireEvent.pointerEnter(productTrigger);
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
    fireEvent.pointerEnter(trigger("产品"));
    fireEvent.pointerEnter(trigger("文档"));

    expect(trigger("产品")).toHaveAttribute("aria-expanded", "false");
    expect(trigger("文档")).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("link", { name: /Agent Studio/ })).toBeNull();
    expect(screen.getAllByRole("region")).toHaveLength(1);
  });

  it("closes on an outside document pointerdown", () => {
    renderMenu();
    fireEvent.pointerEnter(trigger("产品"));

    fireEvent.pointerDown(document.body);

    expect(trigger("产品")).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on Escape and restores focus to the open trigger", () => {
    renderMenu();
    const productTrigger = trigger("产品");
    fireEvent.pointerEnter(productTrigger);
    screen.getByRole("link", { name: /Agent Studio/ }).focus();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(productTrigger).toHaveAttribute("aria-expanded", "false");
    expect(productTrigger).toHaveFocus();
  });

  it("wraps trigger focus with ArrowRight and ArrowLeft", () => {
    renderMenu();
    const homeTrigger = trigger("首页");
    const priceTrigger = trigger("价格与服务");
    priceTrigger.focus();

    fireEvent.keyDown(priceTrigger, { key: "ArrowRight" });
    expect(homeTrigger).toHaveFocus();

    fireEvent.keyDown(homeTrigger, { key: "ArrowLeft" });
    expect(priceTrigger).toHaveFocus();
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
    fireEvent.pointerEnter(productTrigger);
    productTrigger.focus();

    fireEvent.keyDown(productTrigger, { key: "ArrowDown" });

    expect(screen.getByRole("link", { name: /产品概览/ })).toHaveFocus();
  });

  it("labels placeholder parents and children as 尚未开放", () => {
    renderMenu();
    expect(within(trigger("下载")).getByText("尚未开放")).toBeVisible();

    fireEvent.pointerEnter(trigger("下载"));

    const child = screen.getByRole("link", { name: /桌面客户端/ });
    expect(within(child).getByText("尚未开放")).toBeVisible();
  });

  it("marks the current parent and exact child from activeHref", () => {
    renderMenu("/product/agent-studio");

    expect(trigger("产品")).toHaveAttribute("aria-current", "page");
    fireEvent.pointerEnter(trigger("产品"));
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
    fireEvent.pointerEnter(trigger("产品"));
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
    fireEvent.pointerEnter(trigger("产品"));
    const agentStudio = screen.getByRole("link", { name: /Agent Studio/ });
    expect(agentStudio).not.toHaveAttribute("aria-current");

    rerender(<MegaMenu items={items} activeHref="/product/agent-studio#bar" />);
    expect(agentStudio).not.toHaveAttribute("aria-current");

    rerender(<MegaMenu items={items} activeHref="/product/agent-studio" />);
    expect(agentStudio).toHaveAttribute("aria-current", "page");
  });

  it("renders every content section in the open horizontal index", () => {
    renderMenu();
    fireEvent.pointerEnter(trigger("产品"));

    expect(screen.getByRole("heading", { name: "平台" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Agent Studio/ })).toBeVisible();
    expect(screen.getByRole("heading", { name: "指南" })).toBeVisible();
    expect(screen.getByRole("link", { name: /配置指南/ })).toBeVisible();
  });

  it("groups the expanded menu into an overview intro and capability sections", () => {
    renderMenu();
    fireEvent.pointerEnter(trigger("产品"));

    const panel = screen.getByRole("region", { name: "产品" });
    expect(panel).toHaveAttribute("data-menu-label", "产品");
    expect(
      within(panel).getByRole("heading", { name: "产品", level: 2 }),
    ).toBeVisible();
    expect(
      within(panel).getByText("覆盖企业 AI 全生命周期的一站式能力地图。"),
    ).toBeVisible();
    expect(
      within(panel).getByRole("heading", { name: "平台", level: 3 }),
    ).toBeVisible();
    expect(within(panel).getByRole("link", { name: /产品概览/ })).toBe(
      within(panel).getAllByRole("link")[0],
    );
  });

  it("renders distinct labels sharing one confirmed anchor without key warnings", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const sharedAnchorItems: PortalNavigationItem[] = [
      {
        label: "解决方案",
        href: "/solutions",
        children: [
          {
            label: "通用场景方案",
            items: [
              { label: "知识与数据智能", href: "/solutions#scenes" },
              { label: "智能体与业务应用", href: "/solutions#scenes" },
            ],
          },
        ],
      },
    ];

    render(<MegaMenu activeHref="/" items={sharedAnchorItems} />);
    fireEvent.pointerEnter(trigger("解决方案"));

    expect(screen.getByRole("link", { name: "知识与数据智能" })).toBeVisible();
    expect(
      screen.getByRole("link", { name: "智能体与业务应用" }),
    ).toBeVisible();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("renders every partner section from a future-route fixture", () => {
    renderMenu();
    fireEvent.pointerEnter(trigger("合作伙伴"));

    for (const heading of ["商业模式", "伙伴政策", "伙伴培训", "合作对接"]) {
      expect(screen.getByRole("heading", { name: heading })).toBeVisible();
    }
  });

  it("exports a reusable placeholder status badge", () => {
    const { rerender } = render(<NavigationStatusBadge status="placeholder" />);
    expect(screen.getByText("尚未开放")).toBeVisible();

    rerender(<NavigationStatusBadge status="live" />);
    expect(screen.queryByText("尚未开放")).toBeNull();
  });
});
