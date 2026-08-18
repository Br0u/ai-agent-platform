import { expect, test } from "@playwright/test";

import { addSignedSession, fixtureCredentials } from "./auth-fixtures";

test.describe.configure({ mode: "serial" });

test("admin publishes a Windows installer and public downloads preserve its name and bytes", async ({
  page,
  baseURL,
}) => {
  if (!baseURL) throw new Error("baseURL is required");
  await addSignedSession(
    page.context(),
    baseURL,
    "workforce",
    fixtureCredentials().adminSessionToken,
  );

  await page.goto("/admin/downloads", { waitUntil: "domcontentloaded" });
  const resource = page.getByRole("button", { name: /码里奥 桌面客户端/u });
  await resource.click();
  const editor = page.getByRole("region", { name: "码里奥 桌面客户端" });
  await editor.getByLabel("资源名称").fill("码里奥桌面客户端");
  await editor.getByLabel("所属产品").fill("码里奥");
  await editor.getByLabel("资料类型").fill("桌面客户端");
  await editor.getByLabel("版本号").fill("v2.0.0-e2e");
  await editor
    .getByLabel("资源简介")
    .fill("用于隔离浏览器验收的 Windows 桌面客户端。");
  await editor.getByLabel("排序").fill("20");
  await editor.getByRole("button", { name: "保存草稿" }).click();

  const installer = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
  const windowsUpload = editor.getByLabel("上传 Windows 安装包");
  await expect(windowsUpload).toBeEnabled();
  await windowsUpload.setInputFiles({
    name: "mdd2-e2e.exe",
    mimeType: "application/vnd.microsoft.portable-executable",
    buffer: installer,
  });
  await expect(editor.getByText("mdd2-e2e.exe", { exact: true })).toBeVisible();
  await expect(editor.getByText("暂无资源", { exact: true })).toBeVisible();

  await editor.getByRole("button", { name: "发布资源" }).click();
  const confirm = page.getByRole("dialog", { name: "确认发布资源" });
  await confirm.getByRole("button", { name: "确认" }).click();
  await expect(editor.getByLabel("资源发布状态")).toContainText("已发布");

  await page.goto("/downloads", { waitUntil: "domcontentloaded" });
  const client = page.locator('[data-download-key="mdd2-client"]');
  await expect(client).toContainText("mdd2-e2e.exe");
  await expect(client.locator(".download-empty")).toHaveText("暂无资源");
  const [download, downloaded] = await Promise.all([
    page.waitForEvent("download"),
    page.waitForResponse(
      (candidate) =>
        candidate
          .url()
          .endsWith("/api/v1/downloads/mdd2-client/download/windows") &&
        candidate.status() === 200,
    ),
    client.getByRole("link", { name: "下载 Windows 安装包" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("mdd2-e2e.exe");
  expect(downloaded.headers()["content-disposition"]).toContain(
    'filename="mdd2-e2e.exe"',
  );
  const stream = await download.createReadStream();
  if (!stream) throw new Error("installer download stream is unavailable");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks)).toEqual(installer);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/downloads", { waitUntil: "domcontentloaded" });
  const mobileClient = page.locator('[data-download-key="mdd2-client"]');
  const windowsControl = mobileClient.getByRole("link", {
    name: "下载 Windows 安装包",
  });
  await windowsControl.scrollIntoViewIfNeeded();
  await expect(windowsControl).toBeVisible();
  await expect(windowsControl).toBeInViewport();
  await expect(mobileClient.locator(".download-empty")).toHaveText("暂无资源");
});
