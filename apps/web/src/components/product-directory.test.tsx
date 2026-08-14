import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/product/code-agent" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

import { ProductDirectory } from "./product-directory";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  navigation.pathname = "/product/code-agent";
  window.history.replaceState(null, "", "/");
  document.body.style.overflow = "";
});

function installDesktopBreakpoint(initialMatches = false) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  vi.stubGlobal(
    "matchMedia",
    vi.fn((media: string) => ({
      addEventListener: (
        type: string,
        listener: (event: MediaQueryListEvent) => void,
      ) => {
        if (type === "change") listeners.add(listener);
      },
      addListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
      matches: initialMatches,
      media,
      onchange: null,
      removeEventListener: (
        type: string,
        listener: (event: MediaQueryListEvent) => void,
      ) => {
        if (type === "change") listeners.delete(listener);
      },
      removeListener: vi.fn(),
    })),
  );

  return {
    enterDesktop() {
      for (const listener of listeners) {
        listener({
          matches: true,
          media: "(min-width: 901px)",
        } as MediaQueryListEvent);
      }
    },
  };
}

function renderDirectory() {
  return render(
    <div className="product-directory-layout">
      <ProductDirectory />
      <div className="product-directory-content">
        <button type="button">页面内容</button>
      </div>
    </div>,
  );
}

function renderShellDirectory() {
  return render(
    <div className="app-shell">
      <header data-testid="shell-header">
        <button type="button">站点导航</button>
      </header>
      <div className="site-route-transition">
        <div className="product-directory-layout">
          <ProductDirectory />
          <main className="product-directory-content">
            <button type="button">页面内容</button>
          </main>
        </div>
        <div data-testid="floating-widget">
          <button type="button">聊天入口</button>
        </div>
      </div>
      <footer aria-hidden="false" data-testid="shell-footer" inert>
        <button type="button">页脚入口</button>
      </footer>
    </div>,
  );
}

describe("ProductDirectory", () => {
  it("renders the exact V2 directory hierarchy with real routes and anchors", () => {
    render(<ProductDirectory />);

    const directory = screen.getByRole("complementary", { name: "产品目录" });
    const links = within(directory)
      .getAllByRole("link")
      .map((link) => [link.textContent, link.getAttribute("href")]);
    expect(links).toEqual([
      ["独立产品中心", "/product"],
      ["码里奥", "/product/code-agent"],
      ["Skill 技能生态", "/product/code-agent#mdd2-skill"],
      ["MCP 工具集成", "/product/code-agent#mdd2-mcp"],
      ["自然语言开发", "/product/code-agent#mdd2-dev"],
      ["研发生态协同", "/product/code-agent#mdd2-eco"],
      ["AIPPT", "/product/aippt"],
      ["参考资料驱动", "/product/aippt#aippt-ref"],
      ["三种渲染模式", "/product/aippt#aippt-mode"],
      ["自然语言微调", "/product/aippt#aippt-gen"],
      ["人机双写内容", "/product/aippt#aippt-export"],
      ["AISHREK", "/product/aishrek"],
      ["自然语言 CAD", "/product/aishrek#aishrek-import"],
      ["原生精密联动", "/product/aishrek#aishrek-chat"],
      ["多维仿真 CAE", "/product/aishrek#aishrek-link"],
      ["智能体中心", "/product/agents"],
      ["知识智能体", "/product/agent-knowledge"],
      ["数据智能体", "/product/data-agent"],
      ["视频智能体", "/product/agent-video"],
      ["流程编排智能体", "/product/agent-orchestration"],
      ["行业应用中心", "/product/applications"],
      ["通用文本写作", "/product/app-writing"],
      ["投标智能助手", "/product/app-bidding"],
      ["合同智能审查", "/product/app-contract"],
      ["技能中心", "/product/skills"],
      ["研发类技能", "/product/skills-programming"],
      ["应用类技能", "/product/skills-application"],
      ["办公类技能", "/product/skills-office"],
      ["模型中心", "/product/model"],
      ["模型资产管理", "/product/model-assets"],
      ["模型部署与服务", "/product/model-deploy"],
      ["模型训练", "/product/model-training"],
      ["模型评估", "/product/model-evaluation"],
      ["编程中心", "/product/coding"],
      ["自然语言开发", "/product/coding-session"],
      ["双模式工作流", "/product/coding-project"],
      ["内置工具链", "/product/coding-standard"],
      ["权限中心", "/product/governance"],
      ["权限管理", "/product/governance#gov-caps"],
      ["行级权限", "/product/governance#gov-permission"],
    ]);
  });

  it("renders two nested levels and supports folding without changing the route", () => {
    render(<ProductDirectory />);

    const directory = screen.getByRole("complementary", { name: "产品目录" });
    const directoryNavigation = within(directory).getByRole("navigation", {
      name: "产品目录导航",
    });
    const mario = within(directory).getByRole("link", { name: "码里奥" });
    const marioItem = mario.closest("li");
    const skill = within(directory).getByRole("link", {
      name: "Skill 技能生态",
    });
    expect(
      directoryNavigation.querySelector(":scope > ul"),
    ).toBeInTheDocument();
    expect(marioItem).not.toBeNull();
    expect(skill.closest("li")?.parentElement?.parentElement).toBe(marioItem);
    expect(
      within(
        mario.closest(".product-directory-group") as HTMLElement,
      ).getByRole("link", { name: "Skill 技能生态" }),
    ).toBeVisible();

    const toggle = within(directory).getByRole("button", {
      name: "展开或收起码里奥",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      within(directory).queryByRole("link", { name: "Skill 技能生态" }),
    ).not.toBeInTheDocument();
    expect(navigation.pathname).toBe("/product/code-agent");
  });

  it("highlights pathname and hash while keeping standalone canonical", async () => {
    window.history.replaceState(null, "", "/product/code-agent#mdd2-mcp");
    render(<ProductDirectory />);

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "MCP 工具集成" }),
      ).toHaveAttribute("aria-current", "location"),
    );
    expect(screen.getByRole("link", { name: "码里奥" })).not.toHaveAttribute(
      "aria-current",
    );

    window.history.replaceState(null, "", "/product/code-agent#mdd2-dev");
    fireEvent(window, new HashChangeEvent("hashchange"));
    await waitFor(() =>
      expect(
        screen.getAllByRole("link", { name: "自然语言开发" })[0],
      ).toHaveAttribute("aria-current", "location"),
    );
  });

  it("highlights the current route", () => {
    render(<ProductDirectory />);

    expect(screen.getByRole("link", { name: "码里奥" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "权限中心" })).toHaveAttribute(
      "href",
      "/product/governance",
    );
  });

  it("filters the directory and collapses the desktop sidebar", () => {
    render(<ProductDirectory />);

    fireEvent.change(
      screen.getByRole("searchbox", { name: "在产品目录中筛选" }),
      {
        target: { value: "MCP 工具集成" },
      },
    );
    expect(screen.getByRole("link", { name: "独立产品中心" })).toBeVisible();
    expect(screen.getByRole("link", { name: "码里奥" })).toBeVisible();
    expect(screen.getByRole("link", { name: "MCP 工具集成" })).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "AIPPT" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "AISHREK" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "收起产品目录" }));
    expect(screen.getByRole("complementary", { name: "产品目录" })).toHaveClass(
      "is-collapsed",
    );
  });

  it("closes the mobile drawer on Escape and restores trigger focus", () => {
    renderDirectory();

    const trigger = screen.getByRole("button", { name: "打开产品目录" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "产品目录" })).toBeVisible();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "产品目录" }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("isolates page content, traps focus, locks scroll and restores all state", () => {
    renderDirectory();

    const trigger = screen.getByRole("button", { name: "打开产品目录" });
    const content = document.querySelector(".product-directory-content");
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "产品目录" });
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>("button, input, a[href]"),
    );
    expect(content).toHaveAttribute("aria-hidden", "true");
    expect(content).toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("hidden");

    focusable.at(-1)?.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(focusable[0]).toHaveFocus();
    focusable[0]?.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(focusable.at(-1)).toHaveFocus();

    const link = within(dialog).getByRole("link", { name: "AIPPT" });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    expect(
      screen.queryByRole("dialog", { name: "产品目录" }),
    ).not.toBeInTheDocument();
    expect(content).not.toHaveAttribute("aria-hidden");
    expect(content).not.toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("");
    expect(trigger).toHaveFocus();
  });

  it("isolates every shell sibling outside the modal and restores exact state", () => {
    renderShellDirectory();

    const trigger = screen.getByRole("button", { name: "打开产品目录" });
    const header = screen.getByTestId("shell-header");
    const content = document.querySelector(".product-directory-content");
    const floating = screen.getByTestId("floating-widget");
    const footer = screen.getByTestId("shell-footer");
    fireEvent.click(trigger);

    for (const background of [header, content, floating, footer]) {
      expect(background).toHaveAttribute("aria-hidden", "true");
      expect(background).toHaveAttribute("inert");
    }
    expect(trigger).toHaveAttribute("aria-hidden", "true");
    expect(trigger).toHaveAttribute("inert");

    fireEvent.click(
      within(screen.getByRole("dialog", { name: "产品目录" })).getByRole(
        "button",
        { name: "关闭产品目录" },
      ),
    );

    for (const background of [header, content, floating]) {
      expect(background).not.toHaveAttribute("aria-hidden");
      expect(background).not.toHaveAttribute("inert");
    }
    expect(footer).toHaveAttribute("aria-hidden", "false");
    expect(footer).toHaveAttribute("inert");
    expect(trigger).not.toHaveAttribute("aria-hidden");
    expect(trigger).not.toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("");
    expect(trigger).toHaveFocus();
  });

  it("closes and releases modal state when the viewport crosses into desktop", () => {
    const breakpoint = installDesktopBreakpoint();
    renderDirectory();

    const trigger = screen.getByRole("button", { name: "打开产品目录" });
    const content = document.querySelector(".product-directory-content");
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "产品目录" })).toBeVisible();
    expect(content).toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("hidden");

    act(() => breakpoint.enterDesktop());

    expect(
      screen.queryByRole("dialog", { name: "产品目录" }),
    ).not.toBeInTheDocument();
    expect(content).not.toHaveAttribute("aria-hidden");
    expect(content).not.toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("");
    expect(trigger).toHaveFocus();
  });

  it("uses the canonical product entry for standalone and closes on pathname change", () => {
    navigation.pathname = "/product/standalone";
    const view = renderDirectory();

    expect(screen.getByRole("link", { name: "独立产品中心" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    fireEvent.click(screen.getByRole("button", { name: "打开产品目录" }));
    navigation.pathname = "/product/aippt";
    view.rerender(
      <div className="product-directory-layout">
        <ProductDirectory />
        <div className="product-directory-content" />
      </div>,
    );
    expect(
      screen.queryByRole("dialog", { name: "产品目录" }),
    ).not.toBeInTheDocument();
  });

  it("does not steal focus when pathname changes while the drawer is closed", () => {
    const view = renderDirectory();
    const pageContent = screen.getByRole("button", { name: "页面内容" });
    const trigger = screen.getByRole("button", { name: "打开产品目录" });
    pageContent.focus();

    navigation.pathname = "/product/aippt";
    view.rerender(
      <div className="product-directory-layout">
        <ProductDirectory />
        <div className="product-directory-content">
          <button type="button">页面内容</button>
        </div>
      </div>,
    );

    expect(trigger).not.toHaveFocus();
    expect(screen.getByRole("button", { name: "页面内容" })).toHaveFocus();
  });
});
