import { readFileSync } from "node:fs";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PartnerCenter } from "./partner-center";

afterEach(() => {
  window.history.replaceState(null, "", "/");
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.querySelector("[data-test-foreign-anchor]")?.remove();
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    value: 0,
  });
});

function useMedia({ mobile = false, reduced = false } = {}) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((media: string) => ({
      matches: media.includes("prefers-reduced-motion") ? reduced : mobile,
      media,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe("PartnerCenter", () => {
  it("renders five query/hash views without an extra return bar and with absolute directory hrefs", () => {
    window.history.replaceState(null, "", "/partners?view=business#pb-tiers");
    const { container } = render(<PartnerCenter />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "多元化商业模式，匹配每一类伙伴",
      }),
    ).toBeVisible();
    expect(screen.queryByLabelText("合作伙伴面包屑")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "返回上一页" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "分润政策" })).toHaveAttribute(
      "href",
      "/partners?view=business#pb-tiers",
    );
    expect(container.querySelector("#pb-tiers")).toHaveAttribute(
      "data-partner-target",
      "business-tiers",
    );

    fireEvent.click(screen.getByRole("link", { name: "伙伴政策" }));
    expect(
      window.location.pathname + window.location.search + window.location.hash,
    ).toBe("/partners?view=policy#pp-hero");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "清晰的准入与认证体系，提供明确成长路径",
      }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("link", { name: "伙伴培训" }));
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "系统化培训与认证，快速掌握元启平台",
      }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("link", { name: "成为合作伙伴" }));
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "成为华鲲合作伙伴",
      }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("link", { name: "合作伙伴总览" }));
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "共建企业 AI 生态，共享增长机遇",
      }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "合作伙伴总览" })).toHaveAttribute(
      "aria-current",
      "location",
    );
  });

  it("falls back to overview for inherited object keys in the view query", () => {
    for (const view of ["toString", "constructor", "__proto__"]) {
      window.history.replaceState(null, "", `/partners?view=${view}#po-hero`);
      const { unmount } = render(<PartnerCenter />);
      expect(
        screen.getByRole("heading", {
          level: 1,
          name: "共建企业 AI 生态，共享增长机遇",
        }),
      ).toBeVisible();
      unmount();
    }
  });

  it("renders the exact prototype hero actions for every view", () => {
    const cases = [
      [
        "/partners?view=overview#po-hero",
        "po-hero",
        ["成为合作伙伴", "了解商业模式", "联系生态负责人"],
      ],
      [
        "/partners?view=business#pb-hero",
        "pb-hero",
        ["查看合作模式", "成为合作伙伴"],
      ],
      [
        "/partners?view=policy#pp-hero",
        "pp-hero",
        ["查看准入条件", "成为合作伙伴"],
      ],
      [
        "/partners?view=training#pt-hero",
        "pt-hero",
        ["查看课程体系", "联系咨询"],
      ],
      [
        "/partners?view=become#pbc-hero",
        "pbc-hero",
        ["立即申请", "查看准入条件"],
      ],
    ] as const;

    for (const [href, anchor, labels] of cases) {
      window.history.replaceState(null, "", href);
      const { container, unmount } = render(<PartnerCenter />);
      const hero = within(container.querySelector(`#${anchor}`)!);
      expect(
        hero.getAllByRole("button").map((button) => button.textContent),
      ).toEqual(labels);
      unmount();
    }
  });

  it("renders the complete business and policy sections with working closing CTAs", () => {
    window.history.replaceState(null, "", "/partners?view=business#pb-hero");
    const business = render(<PartnerCenter />);
    const comparison = screen.getByRole("table");
    expect(within(comparison).getByText("合作深度")).toBeVisible();
    expect(within(comparison).getByText("典型场景")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "选择华鲲元启，选择共赢" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "申请成为伙伴" })).toBeVisible();
    business.unmount();

    window.history.replaceState(null, "", "/partners?view=policy#pp-hero");
    render(<PartnerCenter />);
    expect(
      screen.getByRole("heading", { name: "如何选择伙伴类型" }),
    ).toBeVisible();
    expect(screen.getByText("拥有客户资源与销售能力")).toBeVisible();
    expect(screen.getByRole("heading", { name: "认证的价值" })).toBeVisible();
    const policyTrigger = screen.getByRole("button", { name: "咨询伙伴政策" });
    fireEvent.click(policyTrigger);
    expect(screen.getByRole("dialog", { name: "伙伴政策咨询" })).toBeVisible();
  });

  it("renders the overview closing CTA", () => {
    const { container } = render(<PartnerCenter />);
    expect(screen.queryByText(/示意内容|上线后替换/u)).not.toBeInTheDocument();
    expect(
      Array.from(container.querySelectorAll("[data-partner-icon]"), (icon) =>
        icon.getAttribute("data-partner-icon"),
      ),
    ).toEqual(["利", "升", "赋", "证"]);
    for (const icon of container.querySelectorAll<HTMLElement>(
      "[data-partner-icon]",
    )) {
      expect(icon.style.getPropertyValue("--partner-icon-image")).toMatch(
        /^url\("\/assets\/partners\/icons\/.+\.svg"\)$/u,
      );
    }
    expect(
      screen.getByRole("heading", { name: "选择华鲲元启，选择共赢" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "了解元启平台 →" }),
    ).toHaveAttribute("href", "/product");
  });

  it("searches, clears and collapses the desktop directory", () => {
    render(<PartnerCenter />);

    expect(
      screen.getByRole("button", { name: "展开合作伙伴目录" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("directory-progress-rail")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "展开合作伙伴目录" }));
    expect(
      screen.queryByTestId("directory-progress-rail"),
    ).not.toBeInTheDocument();

    const search = screen.getByRole("searchbox", {
      name: "在合作伙伴目录中筛选",
    });
    fireEvent.change(search, { target: { value: "认证路径" } });
    expect(screen.getByRole("link", { name: "认证路径" })).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "分润政策" }),
    ).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "不存在的伙伴内容" } });
    fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
    expect(search).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "收起合作伙伴目录" }));
    expect(
      screen.getByRole("button", { name: "展开合作伙伴目录" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("uses only current-view anchors and keeps an active child visible after its group is folded", async () => {
    window.history.replaceState(null, "", "/partners?view=business#pb-hero");
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 0,
    });
    const { container } = render(<PartnerCenter />);
    const groupToggle = screen.getByRole("button", {
      name: "收起商业模式目录",
    });
    fireEvent.click(groupToggle);
    expect(
      screen.queryByRole("link", { name: "分润政策" }),
    ).not.toBeInTheDocument();

    for (const anchor of container.querySelectorAll<HTMLElement>("[id^=pb-]")) {
      anchor.getBoundingClientRect = () =>
        ({ top: anchor.id === "pb-tiers" ? -12 : 1_000 }) as DOMRect;
    }
    const otherViewAnchor = document.createElement("section");
    otherViewAnchor.dataset.testForeignAnchor = "true";
    otherViewAnchor.id = "pp-cert";
    otherViewAnchor.getBoundingClientRect = () => ({ top: -24 }) as DOMRect;
    document.body.append(otherViewAnchor);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 160,
    });
    fireEvent.scroll(window);

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "分润政策" })).toHaveAttribute(
        "aria-current",
        "location",
      ),
    );
    expect(groupToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "伙伴政策" })).not.toHaveAttribute(
      "aria-current",
      "location",
    );
    expect(window.location.hash).toBe("#pb-hero");
    otherViewAnchor.remove();
  });

  it("limits collapsed desktop geometry to widths above the mobile boundary", () => {
    const css = readFileSync("src/app/partners/partners.css", "utf8");
    const selectors = [
      '.partner-shell[data-directory-collapsed="true"] {',
      '.partner-shell[data-directory-collapsed="true"] .partner-directory {',
      '.partner-shell[data-directory-collapsed="true"] .partner-directory__tools {',
    ];

    for (const selector of selectors) {
      const selectorIndex = css.indexOf(selector);
      expect(selectorIndex).toBeGreaterThan(-1);
      expect(
        css.lastIndexOf("@media (min-width: 901px)", selectorIndex),
      ).toBeGreaterThan(
        css.lastIndexOf("@media (max-width: 900px)", selectorIndex),
      );
    }
  });

  it("independently collapses and expands directory groups with children", () => {
    render(<PartnerCenter />);

    const collapse = screen.getByRole("button", {
      name: "收起商业模式目录",
    });
    fireEvent.click(collapse);
    expect(
      screen.queryByRole("link", { name: "合作模式" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "认证体系" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "收起伙伴政策目录" }),
    ).toHaveAttribute("aria-expanded", "true");
    const expand = screen.getByRole("button", {
      name: "展开商业模式目录",
    });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(expand);
    expect(screen.getByRole("link", { name: "合作模式" })).toBeVisible();
  });

  it("isolates the 390 drawer, traps focus both ways and restores the trigger", () => {
    useMedia({ mobile: true });
    const { container } = render(<PartnerCenter />);
    const trigger = screen.getByRole("button", { name: "合作伙伴目录" });
    const directory = document.getElementById(
      trigger.getAttribute("aria-controls")!,
    );

    expect(directory).toHaveAttribute("aria-hidden", "true");
    expect(directory).toHaveAttribute("inert");
    expect(
      screen.queryByRole("button", { name: "关闭合作伙伴目录" }),
    ).not.toBeInTheDocument();

    fireEvent.click(trigger);
    const drawer = screen.getByRole("dialog", { name: "合作伙伴目录" });
    const search = within(drawer).getByRole("searchbox", {
      name: "在合作伙伴目录中筛选",
    });
    expect(search).toHaveFocus();
    expect(container.querySelector(".partner-main")).toHaveAttribute("inert");

    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    expect(search).toHaveFocus();
    const last = within(drawer).getAllByRole("link").at(-1)!;
    last.focus();
    fireEvent.keyDown(drawer, { key: "Tab" });
    expect(search).toHaveFocus();
    search.focus();
    fireEvent.keyDown(drawer, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    outside.remove();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "合作伙伴目录" }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(directory).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".partner-main")).not.toHaveAttribute(
      "inert",
    );
  });

  it("opens the exact contact topic, isolates outside UI and restores focus after Escape", () => {
    const { container } = render(<PartnerCenter />);
    const trigger = within(container.querySelector("#po-hero")!).getByRole(
      "button",
      { name: "联系生态负责人" },
    );
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "生态合作咨询" });
    const close = within(dialog).getByRole("button", { name: "关闭" });
    expect(close).toHaveFocus();
    expect(within(dialog).getByText("联系方式素材待确认")).toBeVisible();
    expect(within(dialog).getByText("邮箱素材待确认")).toBeVisible();
    expect(within(dialog).getByText("联系二维码素材槽位")).toBeVisible();
    expect(document.querySelector(".partner-shell")).toHaveAttribute("inert");

    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    expect(close).toHaveFocus();
    const last = within(dialog).getByRole("button", { name: "复制邮箱" });
    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(close).toHaveFocus();
    close.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    outside.remove();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(dialog).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.querySelector(".partner-shell")).not.toHaveAttribute(
      "inert",
    );
  });

  it("shows the current directory source and exact copy confirmation", () => {
    window.history.replaceState(null, "", "/partners?view=business#pb-tiers");
    render(<PartnerCenter />);
    fireEvent.click(screen.getAllByRole("button", { name: "咨询该模式" })[0]);

    const dialog = screen.getByRole("dialog", {
      name: "渠道分销模式咨询",
    });
    expect(within(dialog).getByText("来源：分润政策")).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "复制电话" }));
    expect(screen.getByRole("status")).toHaveTextContent("联系信息已复制");
  });

  it("closes from the contact backdrop and restores the exact trigger", () => {
    const { container } = render(<PartnerCenter />);
    const trigger = within(container.querySelector("#po-hero")!).getByRole(
      "button",
      { name: "联系生态负责人" },
    );
    fireEvent.click(trigger);

    fireEvent.click(container.querySelector(".partner-dialog-backdrop")!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("highlights a cold hash target for 1.8 seconds", () => {
    vi.useFakeTimers();
    useMedia();
    window.history.replaceState(null, "", "/partners?view=policy#pp-cert");
    const { container } = render(<PartnerCenter />);
    const target = container.querySelector("#pp-cert")!;

    expect(target).toHaveClass("is-targeted");
    vi.advanceTimersByTime(1_799);
    expect(target).toHaveClass("is-targeted");
    vi.advanceTimersByTime(1);
    expect(target).not.toHaveClass("is-targeted");
  });

  it("does not animate target feedback when reduced motion is requested", () => {
    useMedia({ reduced: true });
    window.history.replaceState(null, "", "/partners?view=policy#pp-cert");
    const { container } = render(<PartnerCenter />);

    expect(container.querySelector("#pp-cert")).not.toHaveClass("is-targeted");
  });

  it("opens a cold #partner-contact dialog and restores Escape focus to a safe page entry", () => {
    window.history.replaceState(null, "", "/partners#partner-contact");
    render(<PartnerCenter />);

    expect(screen.getByRole("dialog", { name: "生态合作咨询" })).toBeVisible();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      within(document.querySelector("#po-hero")!).getByRole("button", {
        name: "成为合作伙伴",
      }),
    ).toHaveFocus();
    expect(
      window.location.pathname + window.location.search + window.location.hash,
    ).toBe("/partners?view=overview#po-hero");
  });
});
