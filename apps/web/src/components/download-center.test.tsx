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

  it("opens the mobile directory as a focus-managed drawer and restores focus on Escape", () => {
    useMobileViewport();
    const { container } = render(<DownloadsPage />);
    const trigger = screen.getByRole("button", { name: "下载中心目录" });
    const directory = document.getElementById(
      trigger.getAttribute("aria-controls")!,
    );

    expect(directory).toHaveAttribute("aria-hidden", "true");
    expect(directory).toHaveAttribute("inert");
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "下载中心目录" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(container.querySelector(".download-main")).toHaveAttribute("inert");
    expect(
      within(dialog).getByRole("searchbox", {
        name: "在下载中心目录中筛选",
      }),
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
