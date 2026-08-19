import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DownloadSoftwareArtifacts } from "./download-software-artifacts";

const windows = {
  slot: "windows" as const,
  objectKey: "private/windows.exe",
  originalFilename: "mario.exe",
  extension: ".exe" as const,
  mediaType: "application/vnd.microsoft.portable-executable",
  byteSize: 240_000_000,
  sha256: "a".repeat(64),
};

describe("DownloadSoftwareArtifacts", () => {
  it("renders independent Windows and macOS slots with their accepted extensions", () => {
    render(
      <DownloadSoftwareArtifacts
        artifacts={{ windows, macos: null }}
        disabled={false}
        onRemove={vi.fn()}
        onUpload={vi.fn()}
      />,
    );

    expect(screen.getByText("mario.exe")).toBeVisible();
    expect(screen.getByText("暂无资源")).toBeVisible();
    expect(screen.getByLabelText("上传 Windows 安装包")).toHaveAttribute(
      "accept",
      ".exe,.msi,.zip",
    );
    expect(screen.getByLabelText("上传 macOS 安装包")).toHaveAttribute(
      "accept",
      ".dmg,.pkg,.zip",
    );
    expect(screen.getByText("a".repeat(64))).toBeVisible();
  });

  it("sends upload, replace and remove events to their exact platform slot", () => {
    const onUpload = vi.fn();
    const onRemove = vi.fn();
    render(
      <DownloadSoftwareArtifacts
        artifacts={{ windows, macos: null }}
        disabled={false}
        onRemove={onRemove}
        onUpload={onUpload}
      />,
    );

    fireEvent.change(screen.getByLabelText("上传 macOS 安装包"), {
      target: { files: [new File(["pkg"], "mario.pkg")] },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "移除 Windows 安装包" }),
    );

    expect(onUpload).toHaveBeenCalledWith(
      "macos",
      expect.objectContaining({ name: "mario.pkg" }),
    );
    expect(onRemove).toHaveBeenCalledWith("windows");
  });
});
