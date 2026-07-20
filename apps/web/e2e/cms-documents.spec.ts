import {
  expect,
  test,
  type APIResponse,
  type Locator,
  type Page,
} from "@playwright/test";

import { addSignedSession } from "./auth-fixtures";

type Diagnostics = {
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
  httpFailures: string[];
};

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function watchDiagnostics(page: Page): Diagnostics {
  const diagnostics: Diagnostics = {
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
    httpFailures: [],
  };
  page.on("console", (message) => {
    if (message.type() === "error")
      diagnostics.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "failed";
    const url = new URL(request.url());
    if (
      failure === "net::ERR_ABORTED" &&
      request.resourceType() === "fetch" &&
      ((request.method() === "GET" && url.searchParams.has("_rsc")) ||
        (request.method() === "POST" &&
          typeof request.headers()["next-action"] === "string"))
    ) {
      return;
    }
    diagnostics.requestFailures.push(
      `${request.method()} ${request.url()} ${failure}`,
    );
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      diagnostics.httpFailures.push(
        `${response.status()} ${response.request().method()} ${response.url()}`,
      );
    }
  });
  return diagnostics;
}

async function submitLifecycle(
  page: Page,
  label: string,
  settledOutcome: Locator,
) {
  const button = page.getByRole("button", { name: label });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(settledOutcome).toBeVisible();
}

async function expectPublished(
  responseFactory: () => Promise<APIResponse>,
  marker: string,
) {
  await expect
    .poll(async () => {
      const response = await responseFactory();
      return {
        body: await response.text(),
        status: response.status(),
      };
    })
    .toMatchObject({ status: 200, body: expect.stringContaining(marker) });
}

test.describe("CMS document lifecycle", () => {
  test.describe.configure({ mode: "serial" });

  test("publishes safely and blocks the admin:docs denied fixture", async ({
    browser,
    page,
    request,
    baseURL,
  }, testInfo) => {
    if (!baseURL) throw new Error("baseURL is required");
    const viewport =
      testInfo.project.name === "desktop"
        ? { width: 1440, height: 900 }
        : { width: 390, height: 844 };
    await page.setViewportSize(viewport);
    const diagnostics = watchDiagnostics(page);
    await addSignedSession(
      page.context(),
      baseURL,
      "workforce",
      requiredEnvironment("E2E_MODEL_ADMIN_SESSION_TOKEN"),
    );

    const runId = (
      process.env.CMS_DOCUMENTS_E2E_RUN_ID ?? Date.now().toString(36)
    )
      .toLowerCase()
      .replaceAll(/[^a-z0-9]/gu, "")
      .slice(0, 16);
    const suffix = testInfo.project.name === "desktop" ? "desktop" : "mobile";
    const initialSlug = `cms-e2e-${runId}-${suffix}`;
    const renamedSlug = `${initialSlug}-renamed`;
    const initialTitle = `CMS E2E ${runId} ${suffix}`;
    const initialMarker = `published-${runId}-${suffix}-v1`;
    const updatedMarker = `published-${runId}-${suffix}-v2`;
    const initialPath = `/docs/${initialSlug}`;
    const renamedPath = `/docs/${renamedSlug}`;

    await page.goto("/admin/docs");
    await expect(page.getByRole("heading", { name: "文档管理" })).toBeVisible();
    await page.getByLabel("标题").fill(initialTitle);
    await page.getByLabel("路径标识").fill(initialSlug);
    await page.getByLabel("摘要").fill(`CMS acceptance ${initialMarker}`);
    await page.getByLabel("导航名称").fill(`E2E ${suffix}`);
    await page.getByLabel("导航代码").fill(`E2E_${suffix.toUpperCase()}`);
    await page
      .getByLabel("导航顺序")
      .fill(suffix === "desktop" ? "801" : "802");
    await page
      .getByLabel("文档正文（安全 Markdown）")
      .fill(`## ${initialMarker}\n\nFirst published CMS document.`);
    await submitLifecycle(
      page,
      "创建文档",
      page.getByText("操作已完成。", { exact: true }),
    );

    await page.getByLabel("搜索文档").fill(initialSlug);
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get("search") === initialSlug),
      page.getByRole("button", { name: "应用筛选" }).click(),
    ]);
    await page
      .getByRole("link", { name: new RegExp(initialTitle, "u") })
      .click();
    await expect(
      page.getByRole("heading", { name: initialTitle }),
    ).toBeVisible();
    const revisionState = page.getByLabel("修订与发布状态");

    const selectionUrl = page.url();
    await Promise.all([
      page.waitForURL(/\/admin\/docs\/preview\//u),
      page.getByRole("link", { name: "预览当前修订" }).click(),
    ]);
    await expect(page.getByText(initialMarker)).toBeVisible();
    await page.goto(selectionUrl);

    await submitLifecycle(
      page,
      "发布当前修订",
      revisionState.getByText("已发布 r1", { exact: true }),
    );
    await expectPublished(() => request.get(initialPath), initialMarker);

    await page.reload();
    await page.getByLabel("路径标识").fill(renamedSlug);
    await page.getByLabel("摘要").fill(`CMS acceptance ${updatedMarker}`);
    await page
      .getByLabel("文档正文（安全 Markdown）")
      .fill(`## ${updatedMarker}\n\nSecond published CMS document.`);
    await submitLifecycle(
      page,
      "保存草稿",
      revisionState.getByText("当前修订 r2", { exact: true }),
    );
    const oldPublication = await request.get(initialPath);
    const oldPublicationBody = await oldPublication.text();
    expect(oldPublication.status()).toBe(200);
    expect(oldPublicationBody).toContain(initialMarker);
    expect(oldPublicationBody).not.toContain(updatedMarker);

    await page.reload();
    await submitLifecycle(
      page,
      "发布当前修订",
      revisionState.getByText("已发布 r2", { exact: true }),
    );
    await expect
      .poll(async () => {
        const response = await request.get(initialPath, { maxRedirects: 0 });
        return {
          location: response.headers()["location"],
          status: response.status(),
        };
      })
      .toEqual({ location: renamedPath, status: 308 });
    await expectPublished(() => request.get(renamedPath), updatedMarker);

    await page.reload();
    await submitLifecycle(
      page,
      "归档文档",
      revisionState.getByText("已归档", { exact: true }),
    );
    await expect
      .poll(async () => {
        const response = await request.get(renamedPath);
        return response.status() === 404;
      })
      .toBe(true);

    await page.reload();
    await submitLifecycle(
      page,
      "发布当前修订",
      revisionState.getByText("已发布", { exact: true }),
    );
    await expectPublished(() => request.get(renamedPath), updatedMarker);

    await page.reload();
    const deniedMutationUrl = page.url();
    const protocolProbe = await browser.newContext();
    await addSignedSession(
      protocolProbe,
      baseURL,
      "workforce",
      requiredEnvironment("E2E_MODEL_ADMIN_SESSION_TOKEN"),
    );
    const protocolProbePage = await protocolProbe.newPage();
    await protocolProbePage.goto(deniedMutationUrl);
    await expect(
      protocolProbePage.getByRole("button", { name: "归档文档" }),
    ).toBeVisible();
    let captureProtocolRequest!: (value: {
      body: Buffer;
      contentType: string;
      nextAction: string;
      routerState: string;
    }) => void;
    let rejectProtocolRequest!: (reason: Error) => void;
    const protocolRequest = new Promise<{
      body: Buffer;
      contentType: string;
      nextAction: string;
      routerState: string;
    }>((resolve, reject) => {
      captureProtocolRequest = resolve;
      rejectProtocolRequest = reject;
    });
    await protocolProbePage.route("**/admin/docs**", async (route) => {
      const probeRequest = route.request();
      const headers = probeRequest.headers();
      if (
        probeRequest.method() === "POST" &&
        typeof headers["next-action"] === "string"
      ) {
        const body = probeRequest.postDataBuffer();
        const contentType = headers["content-type"];
        const routerState = headers["next-router-state-tree"];
        if (!body || !contentType || !routerState) {
          rejectProtocolRequest(
            new Error("Archive Server Action protocol is incomplete"),
          );
          await route.abort();
          return;
        }
        captureProtocolRequest({
          body,
          contentType,
          nextAction: headers["next-action"],
          routerState,
        });
        await route.abort();
        return;
      }
      await route.continue();
    });
    const probeClick = protocolProbePage
      .getByRole("button", { name: "归档文档" })
      .click()
      .catch(() => undefined);
    const capturedProtocolRequest = await protocolRequest;
    await probeClick;
    await protocolProbe.close();

    const denied = await browser.newContext();
    await addSignedSession(
      denied,
      baseURL,
      "workforce",
      requiredEnvironment("E2E_STAFF_SESSION_TOKEN"),
    );
    const deniedPage = await denied.newPage();
    const deniedDiagnostics = watchDiagnostics(deniedPage);
    await deniedPage.goto("/admin/docs");
    await expect(
      deniedPage.getByRole("heading", { name: "文档管理" }),
    ).toHaveCount(0);
    const deniedResponse = await denied.request.post(deniedMutationUrl, {
      data: capturedProtocolRequest.body,
      headers: {
        Accept: "text/x-component",
        "Content-Type": capturedProtocolRequest.contentType,
        "Next-Action": capturedProtocolRequest.nextAction,
        "Next-Router-State-Tree": capturedProtocolRequest.routerState,
        Origin: baseURL,
      },
      maxRedirects: 0,
    });
    const deniedResponseBody = await deniedResponse.text();
    expect(deniedResponse.status()).toBe(200);
    expect(deniedResponseBody).toContain('"kind":"domain_error"');
    expect(deniedResponseBody).toContain("AUTH_PERMISSION_DENIED");
    await expectPublished(() => request.get(renamedPath), updatedMarker);
    await denied.close();

    expect(diagnostics).toEqual({
      consoleErrors: [],
      pageErrors: [],
      requestFailures: [],
      httpFailures: [],
    });
    expect(deniedDiagnostics.consoleErrors).toEqual([]);
    expect(deniedDiagnostics.pageErrors).toEqual([]);
    expect(deniedDiagnostics.requestFailures).toEqual([]);
  });
});
