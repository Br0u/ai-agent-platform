import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DownloadsPage from "../app/downloads/page";

afterEach(() => vi.unstubAllGlobals());

function useMobileViewport() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: true,
      media: "(max-width: 780px)",
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

    for (const href of [
      "/downloads#dl-yuanqi-intro",
      "/downloads#dl-yuanqi-features",
      "/downloads#dl-yuanqi-arch",
      "/downloads#dl-mdd2-intro",
      "/downloads#dl-mdd2-features",
      "/downloads#dl-mdd2-env",
      "/downloads#dl-mdd2-client",
      "/downloads#dl-mdd2-deploy",
      "/downloads#dl-mdd2-usage",
      "/downloads#dl-yuanqi-deploy",
      "/downloads#dl-wp-ai",
      "/downloads#dl-wp-llm",
      "/downloads#dl-wp-agent",
    ]) {
      expect(directory.querySelectorAll(`a[href="${href}"]`)).toHaveLength(1);
      expect(container.querySelectorAll(`#${href.split("#")[1]}`)).toHaveLength(
        1,
      );
    }
  });

  it("uses level-three headings for every resource card", () => {
    render(<DownloadsPage />);

    for (const name of [
      "元启 AI 开发赋能平台产品介绍",
      "元启平台功能清单",
      "元启平台架构说明",
      "码多多 2.0 产品介绍",
      "码多多 2.0 功能清单",
      "码多多 2.0 支持环境说明",
      "码多多 2.0 安装部署指南",
      "码多多 2.0 使用说明",
      "元启平台部署文档",
      "企业 AI 落地白皮书",
      "大模型应用实践白皮书",
      "智能体与业务自动化技术资料",
    ]) {
      expect(screen.getByRole("heading", { level: 3, name })).toBeVisible();
    }
  });

  it("searches, clears and collapses the desktop directory", () => {
    render(<DownloadsPage />);
    const search = screen.getByRole("searchbox", {
      name: "在下载中心目录中筛选",
    });

    fireEvent.change(search, { target: { value: "安装部署指南" } });
    expect(
      screen.getByRole("link", { name: "码多多 2.0 安装部署指南" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "企业 AI 落地白皮书" }),
    ).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "不存在的资料" } });
    fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
    expect(search).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "收起下载中心目录" }));
    expect(
      screen.getByRole("button", { name: "展开下载中心目录" }),
    ).toHaveAttribute("aria-expanded", "false");
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
        name: "在线预览元启 AI 开发赋能平台产品介绍",
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "「元启 AI 开发赋能平台产品介绍」在线预览：正式版提供，原型以内容槽位示意",
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "下载资料元启 AI 开发赋能平台产品介绍",
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "「元启 AI 开发赋能平台产品介绍」下载：原型阶段暂不提供真实文件，正式版上线后开放",
    );
  });

  it("requires software confirmation and restores its trigger after Escape or confirmation", () => {
    render(<DownloadsPage />);
    const trigger = screen.getByRole("button", {
      name: "下载安装码多多 2.0 桌面客户端",
    });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "确认下载安装包" });
    const confirm = within(dialog).getByRole("button", { name: "确认下载" });
    expect(confirm).toBeDisabled();
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
