import { existsSync, readFileSync } from "node:fs";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DownloadsPage from "../app/downloads/page";
import { downloadResources } from "./download-center-content";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

function useMobileViewport() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: true,
      media: "(max-width: 900px)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
}

describe("DownloadCenter", () => {
  it("resolves every resource directory href to exactly one DOM target", () => {
    const { container } = render(<DownloadsPage />);
    const directory = within(container).getByRole("navigation", {
      name: "下载中心完整目录",
    });

    const resourceKeys = [
      ...downloadResources.materials,
      { key: "mdd2-client" },
      ...downloadResources.deployment,
      ...downloadResources.whitepapers,
    ].map(({ key }) => key);
    for (const key of resourceKeys) {
      const href = `/downloads#dl-${key}`;
      expect(directory.querySelectorAll(`a[href="${href}"]`)).toHaveLength(1);
      expect(container.querySelectorAll(`#${href.split("#")[1]}`)).toHaveLength(
        1,
      );
    }
  });

  it("uses level-three headings for every resource card", () => {
    render(<DownloadsPage />);

    for (const name of [
      ...downloadResources.materials,
      ...downloadResources.deployment,
      ...downloadResources.whitepapers,
    ].map(({ title }) => title)) {
      expect(screen.getByRole("heading", { level: 3, name })).toBeVisible();
    }
  });

  it("styles level-three resource headings and offsets every resource anchor", () => {
    const css = readFileSync("src/app/downloads/downloads.css", "utf8");

    expect(css).toMatch(/\.download-card h3\s*\{/u);
    expect(css).not.toMatch(/\.download-card h4\s*\{/u);
    expect(css).toMatch(
      /\[data-download-key\]\s*\{[^}]*scroll-margin-top:\s*88px;/u,
    );
    expect(css).toMatch(
      /@media \(max-width: 900px\)[\s\S]*?\[data-download-key\]\s*\{[^}]*scroll-margin-top:\s*132px;/u,
    );
  });

  it("uses the approved local visual asset and scoped premium effects", () => {
    const css = readFileSync("src/app/downloads/downloads.css", "utf8");
    const backgroundAsset = "public/assets/downloads/resource-flow-bg.webp";

    expect(existsSync(backgroundAsset)).toBe(true);
    expect(css).toContain('url("/assets/downloads/resource-flow-bg.webp")');
    expect(css).toMatch(/\.download-card\s*\{[^}]*backdrop-filter:/su);
    expect(css).toMatch(/\.download-card\s*\{[^}]*box-shadow:/su);
    expect(css).toMatch(
      /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?\.download-card:hover/u,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.download-card/u,
    );
    expect(css).not.toMatch(/transition\s*:\s*all\b/u);
  });

  it("searches, clears and collapses the desktop directory", () => {
    render(<DownloadsPage />);
    const search = screen.getByRole("searchbox", {
      name: "在下载中心目录中筛选",
    });

    expect(
      screen.getByRole("button", { name: "展开下载中心目录" }),
    ).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "展开下载中心目录" }));

    fireEvent.change(search, { target: { value: "部署安装操作手册" } });
    expect(
      screen.getByRole("link", { name: "元启·部署安装操作手册" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "元启·技术白皮书" }),
    ).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "不存在的资料" } });
    fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
    expect(search).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "收起下载中心目录" }));
    expect(
      screen.getByRole("button", { name: "展开下载中心目录" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("renders product materials as a three-level directory", () => {
    render(<DownloadsPage />);
    fireEvent.click(screen.getByRole("button", { name: "展开下载中心目录" }));
    const directory = screen.getByRole("navigation", {
      name: "下载中心完整目录",
    });
    const materials = within(directory)
      .getByRole("link", { name: "产品资料" })
      .closest("li")!;

    expect(within(materials).getByText("元启 AI 开发赋能平台")).toBeVisible();
    expect(within(materials).getByText("视觉检索智能体")).toBeVisible();
    expect(
      within(materials).getByRole("link", { name: "元启·全栈解决方案" }),
    ).toHaveAttribute("href", "/downloads#dl-yuanqi-fullstack");
  });

  it("marks the selected download anchor like the product directory", () => {
    window.history.replaceState({}, "", "/downloads#dl-materials");
    render(<DownloadsPage />);

    expect(screen.getByRole("link", { name: "产品资料" })).toHaveAttribute(
      "aria-current",
      "location",
    );
  });

  it("keeps the closed backdrop non-interactive and manages drawer focus", () => {
    useMobileViewport();
    const { container } = render(<DownloadsPage />);
    const trigger = screen.getByRole("button", { name: "下载中心目录" });
    const directory = document.getElementById(
      trigger.getAttribute("aria-controls")!,
    );

    expect(directory).toHaveAttribute("aria-hidden", "true");
    expect(directory).toHaveAttribute("inert");
    expect(
      screen.queryByRole("button", { name: "关闭下载中心目录" }),
    ).not.toBeInTheDocument();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "下载中心目录" });
    const backdrop = screen.getByRole("button", {
      name: "关闭下载中心目录",
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(container.querySelector(".download-main")).toHaveAttribute("inert");
    expect(
      within(dialog).getByRole("searchbox", {
        name: "在下载中心目录中筛选",
      }),
    ).toHaveFocus();

    const search = within(dialog).getByRole("searchbox", {
      name: "在下载中心目录中筛选",
    });
    const last = within(dialog).getAllByRole("link").at(-1)!;
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    expect(search).toHaveFocus();
    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(search).toHaveFocus();
    search.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    outside.remove();

    fireEvent.click(backdrop);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: "关闭下载中心目录" }),
    ).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(
      within(screen.getByRole("dialog", { name: "下载中心目录" })).getByRole(
        "searchbox",
        { name: "在下载中心目录中筛选" },
      ),
    ).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
    expect(directory).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".download-main")).not.toHaveAttribute(
      "inert",
    );
  });

  it("shows exact prototype-only notices for previews and document downloads", () => {
    render(<DownloadsPage />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "在线预览元启·全栈解决方案",
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "「元启·全栈解决方案」在线预览：正式版提供，原型以内容槽位示意",
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "下载资料元启·全栈解决方案",
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "「元启·全栈解决方案」下载：原型阶段暂不提供真实文件，正式版上线后开放",
    );
  });

  it("keeps only the software dialog active if it opens from the mobile state", () => {
    useMobileViewport();
    render(<DownloadsPage />);
    fireEvent.click(screen.getByRole("button", { name: "下载中心目录" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "下载安装码里奥 桌面客户端",
      }),
    );

    expect(
      screen.getByRole("dialog", { name: "确认下载安装包" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("dialog", { name: "下载中心目录" }),
    ).not.toBeInTheDocument();
  });

  it("requires software confirmation and restores its trigger after Escape or confirmation", () => {
    render(<DownloadsPage />);
    const trigger = screen.getByRole("button", {
      name: "下载安装码里奥 桌面客户端",
    });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "确认下载安装包" });
    const confirm = within(dialog).getByRole("button", { name: "确认下载" });
    expect(confirm).toBeDisabled();
    const close = within(dialog).getByRole("button", { name: "关闭" });
    const cancel = within(dialog).getByRole("button", { name: "取消" });
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    expect(close).toHaveFocus();
    cancel.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(close).toHaveFocus();
    close.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(cancel).toHaveFocus();
    outside.remove();
    fireEvent.click(
      within(dialog).getByRole("checkbox", {
        name: "我已了解该版本的适用环境和使用说明",
      }),
    );
    expect(confirm).toBeEnabled();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(dialog).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    const reopened = screen.getByRole("dialog", { name: "确认下载安装包" });
    const reopenedConfirm = within(reopened).getByRole("button", {
      name: "确认下载",
    });
    expect(reopenedConfirm).toBeDisabled();
    fireEvent.click(
      within(reopened).getByRole("checkbox", {
        name: "我已了解该版本的适用环境和使用说明",
      }),
    );
    fireEvent.click(reopenedConfirm);
    expect(screen.getByRole("status")).toHaveTextContent(
      "已创建下载任务：原型阶段不实际下载，正式版提供安装包",
    );
    expect(trigger).toHaveFocus();
  });
});
