import {
  expect,
  test,
  type Locator,
  type Page,
  type Request,
  type Response,
  type TestInfo,
} from "@playwright/test";

import { addSignedSession, fixtureCredentials } from "./auth-fixtures";
import {
  ASSISTANT_STREAM_MEDIA_TYPE,
  formatAssistantStreamEvent,
} from "../src/features/assistant/assistant-stream";

const VIEWPORTS = {
  desktop: { width: 1440, height: 1000 },
  mobile: { width: 390, height: 844 },
} as const;

type BrowserEvidence = {
  consoleMessages: Array<{ level: string; text: string; url: string }>;
  pageErrors: string[];
  requestFailures: Array<{
    method: string;
    url: string;
    errorText: string;
  }>;
  unexpectedResponses: string[];
};

function collectEvidence(page: Page): BrowserEvidence {
  const evidence: BrowserEvidence = {
    consoleMessages: [],
    pageErrors: [],
    requestFailures: [],
    unexpectedResponses: [],
  };

  page.on("console", (message) => {
    evidence.consoleMessages.push({
      level: message.type(),
      text: message.text(),
      url: message.location().url,
    });
  });
  page.on("pageerror", (error) => evidence.pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    evidence.requestFailures.push({
      method: request.method(),
      url: request.url(),
      errorText: request.failure()?.errorText ?? "failed",
    });
  });
  page.on("response", (response) => {
    if (
      response.status() === 404 ||
      response.status() === 429 ||
      response.status() >= 500
    ) {
      evidence.unexpectedResponses.push(
        `${response.status()} ${response.request().method()} ${response.url()}`,
      );
    }
  });

  return evidence;
}

async function configure(
  page: Page,
  testInfo: TestInfo,
  reducedMotion: "no-preference" | "reduce" = "no-preference",
) {
  const project = testInfo.project.name as keyof typeof VIEWPORTS;
  expect(Object.keys(VIEWPORTS)).toContain(project);
  await page.setViewportSize(VIEWPORTS[project]);
  await page.emulateMedia({ reducedMotion });
}

async function expectExactViewportWidth(page: Page) {
  expect(await page.evaluate(() => window.innerWidth)).toBe(
    page.viewportSize()?.width,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth === window.innerWidth,
    ),
  ).toBe(true);
}

async function expectVisibleKeyboardFocus(locator: Locator) {
  await expect(locator).toBeFocused();
  const focus = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
  expect(focus.outlineStyle).not.toBe("none");
  expect(focus.outlineWidth).not.toBe("0px");
}

async function tabTo(page: Page, target: Locator, limit = 80) {
  for (let index = 0; index < limit; index += 1) {
    await page.keyboard.press("Tab");
    if (
      await target.evaluate((element) => element === document.activeElement)
    ) {
      await expectVisibleKeyboardFocus(target);
      return;
    }
  }
  throw new Error(
    `Keyboard focus did not reach ${await target.getAttribute("aria-label")}`,
  );
}

async function focusWorkspaceComposer(page: Page, composer: Locator) {
  const headerEntry = page.getByRole("button", {
    name: "聚焦 AI 助理提问框",
  });
  await tabTo(page, headerEntry);
  await page.keyboard.press("Enter");
  await expect(composer).toBeFocused();
  await expect
    .poll(async () =>
      composer.evaluate((element) => {
        const surface = element.closest(".assistant-prompt-input__surface");
        if (surface === null)
          throw new Error("Assistant prompt surface is missing");
        return getComputedStyle(surface).borderColor;
      }),
    )
    .toBe("rgba(126, 151, 216, 0.7)");
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(`${testInfo.project.name}-${name}`, {
    body: await page.screenshot({ animations: "disabled", fullPage: true }),
    contentType: "image/png",
  });
}

async function installOrbDrawCounter(page: Page) {
  await page.addInitScript(() => {
    const nativeClearRect = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      const canvas = this.canvas;
      if (canvas.classList.contains("assistant-orb__canvas")) {
        const count = Number.parseInt(canvas.dataset.orbDrawCount ?? "0", 10);
        canvas.dataset.orbDrawCount = String(count + 1);
      }
      return nativeClearRect.apply(this, args);
    };
  });
}

async function orbDrawCount(orb: Locator) {
  const canvas = orb.locator("canvas");
  if ((await canvas.count()) === 0) return 0;
  return canvas.evaluate((element) =>
    Number.parseInt(
      (element as HTMLCanvasElement).dataset.orbDrawCount ?? "0",
      10,
    ),
  );
}

async function expectOrbDrawing(orb: Locator) {
  const initial = await orbDrawCount(orb);
  await expect.poll(() => orbDrawCount(orb)).toBeGreaterThan(initial);
}

async function expectOrbPaused(orb: Locator) {
  await expect
    .poll(
      async () => {
        const before = await orbDrawCount(orb);
        await new Promise((resolve) => setTimeout(resolve, 160));
        return (await orbDrawCount(orb)) - before;
      },
      { timeout: 3_000 },
    )
    .toBe(0);
}

async function expectStaticOrbFrame(orb: Locator) {
  await expectOrbPaused(orb);
}

function isExpectedUnusedPreloadWarning(
  message: BrowserEvidence["consoleMessages"][number],
  applicationOrigin?: string,
) {
  if (
    applicationOrigin === undefined ||
    message.level !== "warning" ||
    !message.text.startsWith(`The resource ${applicationOrigin}/`) ||
    !message.text.endsWith(
      " was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
    )
  ) {
    return false;
  }

  return message.url === "" || message.url.startsWith(applicationOrigin);
}

function isExpectedNavigationCancellation(
  failure: BrowserEvidence["requestFailures"][number],
  applicationOrigin?: string,
) {
  if (
    applicationOrigin === undefined ||
    failure.errorText !== "net::ERR_ABORTED"
  ) {
    return false;
  }

  try {
    const url = new URL(failure.url);
    if (url.origin !== applicationOrigin) {
      return false;
    }
    if (failure.method === "GET") {
      return (
        url.searchParams.has("_rsc") ||
        url.pathname.startsWith("/_next/static/") ||
        (url.pathname === "/api/v1/session/staff" && url.search === "")
      );
    }
    return false;
  } catch {
    return false;
  }
}

function expectCleanEvidence(
  evidence: BrowserEvidence,
  applicationOrigin?: string,
) {
  const knownDevelopmentMessages = evidence.consoleMessages.filter(
    (message) =>
      message.url.startsWith("webpack-internal:///") &&
      (message.text.startsWith("%cDownload the React DevTools") ||
        message.text === "[HMR] connected" ||
        message.text.startsWith("[Fast Refresh]") ||
        message.text.startsWith("You have Reduced Motion enabled")),
  );
  const knownBrowserMessages = evidence.consoleMessages.filter((message) =>
    isExpectedUnusedPreloadWarning(message, applicationOrigin),
  );
  const allowedNavigationCancellations = evidence.requestFailures.filter(
    (failure) => isExpectedNavigationCancellation(failure, applicationOrigin),
  );
  expect(
    evidence.consoleMessages.filter(
      (message) =>
        !knownDevelopmentMessages.includes(message) &&
        !knownBrowserMessages.includes(message),
    ),
  ).toEqual([]);
  expect(evidence.pageErrors).toEqual([]);
  expect(
    evidence.requestFailures.filter(
      (failure) => !allowedNavigationCancellations.includes(failure),
    ),
  ).toEqual([]);
  expect(evidence.unexpectedResponses).toEqual([]);
}

const ASSISTANT_CHAT_ENDPOINT = "/api/v1/assistant/chat";
const ASSISTANT_STATUS_ENDPOINT = "/api/v1/assistant/status";

async function activateAssistantWithStatus(
  page: Page,
  activate: () => Promise<void>,
) {
  const statusEvents: string[] = [];
  const isAssistantStatusRequest = (url: string) =>
    url.endsWith(ASSISTANT_STATUS_ENDPOINT);
  const onResponse = (response: Response) => {
    if (isAssistantStatusRequest(response.url())) {
      statusEvents.push(
        `response ${response.status()} ${response.request().method()}`,
      );
    }
  };
  const onRequestFailed = (request: Request) => {
    if (isAssistantStatusRequest(request.url())) {
      statusEvents.push(
        `requestfailed ${request.method()} ${request.failure()?.errorText ?? "unknown"}`,
      );
    }
  };
  page.on("response", onResponse);
  page.on("requestfailed", onRequestFailed);
  const statusResponse = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith(ASSISTANT_STATUS_ENDPOINT) &&
      candidate.status() === 200,
  );
  try {
    await activate();
    await statusResponse;
  } catch (error) {
    const observation =
      statusEvents.length === 0
        ? "no assistant status request observed"
        : statusEvents.join(", ");
    throw new Error(
      `assistant activation did not receive a 200 status response: ${observation}`,
      { cause: error },
    );
  } finally {
    page.off("response", onResponse);
    page.off("requestfailed", onRequestFailed);
  }
}

async function expectSingleDialog(page: Page, name: "码多多工作区" | "码多多") {
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.getByRole("dialog", { name })).toBeVisible();
}

function assistantStreamResponse(
  content: string,
  options: {
    activity?: { phase: "reading" | "analyzing" | "tool"; label: string };
    action?: { label: string; pathname: string };
  } = {},
) {
  return [
    ...(options.activity === undefined
      ? []
      : [
          formatAssistantStreamEvent({ type: "activity", ...options.activity }),
        ]),
    formatAssistantStreamEvent({ type: "answer_delta", content }),
    ...(options.action === undefined
      ? []
      : [
          formatAssistantStreamEvent({
            type: "action",
            action: { kind: "navigate", ...options.action },
          }),
        ]),
    formatAssistantStreamEvent({ type: "done" }),
  ].join("");
}

test("portal header, quick assistant, and standalone workspace are keyboard-safe", async ({
  page,
}, testInfo) => {
  test.setTimeout(45_000);
  await configure(page, testInfo);
  const evidence = collectEvidence(page);
  await page.route(`**${ASSISTANT_CHAT_ENDPOINT}`, async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      version: "2",
      message: "如何开始了解平台？",
      history: [],
      page: { pathname: "/", search: "" },
    });
    await route.fulfill({
      status: 200,
      contentType: ASSISTANT_STREAM_MEDIA_TYPE,
      body: assistantStreamResponse(
        "你可以从快速开始文档了解平台结构和使用入口。",
      ),
    });
  });
  await page.goto("/");
  await expectExactViewportWidth(page);

  const topEntry = page.getByRole("button", { name: "打开 AI 助理" });
  await expect(topEntry).toBeVisible();
  await tabTo(page, topEntry);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/assistant$/u);
  await expect(page.getByRole("main", { name: "码多多工作区" })).toBeVisible();
  await expectExactViewportWidth(page);
  const composer = page.getByRole("textbox", { name: "输入问题" });
  await focusWorkspaceComposer(page, composer);
  await page.getByRole("link", { name: "缩小码多多并返回主页面" }).click();
  await expect(page).toHaveURL(/\/$/u);

  await expectExactViewportWidth(page);
  const floatingEntry = page.getByRole("button", { name: "打开码多多" });
  await expect(floatingEntry).toBeVisible();

  await tabTo(page, floatingEntry);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "码多多" });
  const quickClose = dialog.getByRole("button", {
    name: "关闭码多多",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(quickClose).toBeFocused();
  const presets = dialog.getByRole("group", { name: "常用问题" });
  await expect(presets).toBeVisible();
  const presetBoxes = await presets.getByRole("button").evaluateAll((buttons) =>
    buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    }),
  );
  expect(new Set(presetBoxes.map((box) => Math.round(box.top))).size).toBe(1);
  await attachScreenshot(page, testInfo, "portal-drawer");

  const presetResponse = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith(ASSISTANT_CHAT_ENDPOINT) &&
      candidate.status() === 200,
  );
  await page.getByRole("button", { name: "如何开始了解平台？" }).click();
  await presetResponse;
  await expect(presets).toHaveCount(0);
  await expect(
    page
      .getByRole("log")
      .getByText("你可以从快速开始文档了解平台结构和使用入口。", {
        exact: true,
      }),
  ).toBeVisible();

  await quickClose.click();
  await expect(dialog).toHaveCount(0);
  await expect(floatingEntry).toBeFocused();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await floatingEntry.click();
  const reducedDialog = page.getByRole("dialog", { name: "码多多" });
  await expect(reducedDialog).toBeVisible();
  await expect(quickClose).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(reducedDialog).toHaveCount(0);
  await expect(floatingEntry).toBeFocused();

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.keyboard.press("Enter");
  await expect(quickClose).toBeFocused();
  const expandDock = page.getByRole("button", {
    name: "展开码多多工作区",
  });
  await tabTo(page, expandDock);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/assistant$/u);
  await expect(page.getByRole("main", { name: "码多多工作区" })).toBeVisible();
  await expect(page.getByRole("button", { name: "打开码多多" })).toHaveCount(0);
  await focusWorkspaceComposer(page, composer);
  await expectExactViewportWidth(page);
  await attachScreenshot(page, testInfo, "assistant-workspace");
  await page.unroute(`**${ASSISTANT_CHAT_ENDPOINT}`);
  expectCleanEvidence(evidence, new URL(page.url()).origin);
});

test("desktop quick launcher expands into the keyboard-focusable workspace", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop workspace contract");
  await configure(page, testInfo, "reduce");
  const evidence = collectEvidence(page);
  await page.goto("/");
  await activateAssistantWithStatus(page, () =>
    page.getByRole("button", { name: "打开码多多" }).click(),
  );
  await expectSingleDialog(page, "码多多");
  await page.getByRole("button", { name: "展开码多多工作区" }).click();
  await expect(page).toHaveURL(/\/assistant$/u);
  await expectExactViewportWidth(page);
  await expect(page.getByRole("main", { name: "码多多工作区" })).toBeVisible();
  const composer = page.getByRole("textbox", { name: "输入问题" });
  await focusWorkspaceComposer(page, composer);
  await expectExactViewportWidth(page);
  expectCleanEvidence(evidence, new URL(page.url()).origin);
});

test("workspace has no conversation rail at any responsive breakpoint", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop breakpoint contract");
  await configure(page, testInfo, "reduce");
  const evidence = collectEvidence(page);
  await page.goto("/");
  await activateAssistantWithStatus(page, () =>
    page.getByRole("button", { name: "打开码多多" }).click(),
  );
  await page.getByRole("button", { name: "展开码多多工作区" }).click();
  const workspace = page.getByRole("main", { name: "码多多工作区" });
  await expect(workspace).toBeVisible();
  for (const width of [721, 720]) {
    await page.setViewportSize({ width, height: VIEWPORTS.desktop.height });
    await expect(page.getByRole("complementary")).toHaveCount(0);
    await expect(page.getByText("CONVERSATIONS", { exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByRole("button", { name: "新建会话" })).toHaveCount(0);
  }
  await expectExactViewportWidth(page);
  expectCleanEvidence(evidence, new URL(page.url()).origin);
});

test("thinking orb pauses natively when offscreen and resumes", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "desktop intersection contract",
  );
  await configure(page, testInfo);
  await installOrbDrawCounter(page);
  const evidence = collectEvidence(page);
  await page.goto("/assistant");
  const orb = page
    .getByRole("main", { name: "码多多工作区" })
    .locator(".assistant-workspace__utility .assistant-orb");
  await expect(orb).toHaveAttribute("data-orb-state", "breathing");
  await expectOrbDrawing(orb);

  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.style.height = "3000px";
    spacer.setAttribute("data-testid", "orb-offscreen-spacer");
    document.body.append(spacer);
    window.scrollTo({ top: document.documentElement.scrollHeight });
  });
  await expect
    .poll(() => orb.evaluate((node) => node.getBoundingClientRect().bottom))
    .toBeLessThan(0);
  await expectOrbPaused(orb);
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await expect
    .poll(() => orb.evaluate((node) => node.getBoundingClientRect().top))
    .toBeGreaterThanOrEqual(0);
  await expectOrbDrawing(orb);

  expectCleanEvidence(evidence, new URL(page.url()).origin);
});

if (process.env.RUN_HEADED_ORB_VISIBILITY_E2E === "true") {
  test("thinking orb pauses natively when the page is hidden and resumes", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "desktop page visibility contract",
    );
    await configure(page, testInfo);
    await installOrbDrawCounter(page);
    const evidence = collectEvidence(page);
    await page.goto("/assistant");
    const orb = page
      .getByRole("main", { name: "码多多工作区" })
      .locator(".assistant-workspace__utility .assistant-orb");
    await expectOrbDrawing(orb);

    const popup = page.waitForEvent("popup");
    await page.evaluate(() => window.open("about:blank", "_blank"));
    const foreground = await popup;
    await foreground.bringToFront();
    await expect
      .poll(() => page.evaluate(() => document.visibilityState))
      .toBe("hidden");
    await expectOrbPaused(orb);
    await foreground.close();
    await page.bringToFront();
    await expect
      .poll(() => page.evaluate(() => document.visibilityState))
      .toBe("visible");
    await expectOrbDrawing(orb);
    expectCleanEvidence(evidence, new URL(page.url()).origin);
  });
}

test("streaming activity becomes a collapsed audit trail with safe actions", async ({
  page,
}, testInfo) => {
  test.setTimeout(45_000);
  await configure(page, testInfo, "reduce");
  await installOrbDrawCounter(page);
  const evidence = collectEvidence(page);
  await page.addInitScript(
    ({ chatPath }) => {
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const rawUrl =
          typeof input === "string"
            ? input
            : input instanceof Request
              ? input.url
              : input.toString();
        if (new URL(rawUrl, window.location.href).pathname !== chatPath) {
          return nativeFetch(input, init);
        }

        const encoder = new TextEncoder();
        const frame = (event: unknown) =>
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              frame({
                type: "activity",
                phase: "reading",
                label: "正在读取页面",
              }),
            );
            window.setTimeout(() => {
              controller.enqueue(
                frame({
                  type: "activity",
                  phase: "analyzing",
                  label: "正在分析需求",
                }),
              );
            }, 1_200);
            window.setTimeout(() => {
              controller.enqueue(
                frame({
                  type: "activity",
                  phase: "tool",
                  label: "正在执行操作",
                }),
              );
            }, 2_400);
            window.setTimeout(() => {
              controller.enqueue(
                frame({
                  type: "answer_delta",
                  content: "安全回答包含 [外部说明](https://example.com)。",
                }),
              );
              controller.enqueue(
                frame({
                  type: "action",
                  action: {
                    kind: "navigate",
                    label: "查看价格",
                    pathname: "/pricing",
                  },
                }),
              );
              controller.enqueue(frame({ type: "done" }));
              controller.close();
            }, 3_600);
          },
        });
        return Promise.resolve(
          new Response(stream, {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          }),
        );
      };
    },
    { chatPath: ASSISTANT_CHAT_ENDPOINT },
  );

  await page.goto("/product");
  await expect(
    page.getByRole("button", { name: "打开码多多" }).locator(".assistant-orb"),
  ).toHaveCount(0);
  await activateAssistantWithStatus(page, () =>
    page.getByRole("button", { name: "打开码多多" }).click(),
  );
  const dialog = page.getByRole("dialog", { name: "码多多" });
  const input = dialog.getByRole("textbox", { name: "向码多多提问" });
  await input.fill("请分析并给出安全跳转");
  await dialog.getByRole("button", { name: "发送消息" }).click();
  const streamedMessage = dialog
    .locator(".floating-assistant__message--assistant")
    .last();

  for (const state of [
    {
      label: "正在读取页面",
      orbLabel: "码多多正在读取页面",
      orbState: "searching",
    },
    {
      label: "正在分析需求",
      orbLabel: "码多多正在分析",
      orbState: "solving",
    },
    {
      label: "正在执行操作",
      orbLabel: "码多多正在执行操作",
      orbState: "working",
    },
  ]) {
    const currentActivity = dialog
      .getByRole("status", { name: "" })
      .filter({ hasText: state.label });
    await expect(currentActivity).toBeVisible();
    await expect(currentActivity).toHaveAttribute("aria-live", "polite");
    await expect(currentActivity.getByRole("img")).toHaveCount(0);
    await expect(
      streamedMessage.getByRole("img", { name: state.orbLabel }),
    ).toBeVisible();
    const orb = streamedMessage.locator(".assistant-orb");
    await expect(orb).toHaveAttribute("data-orb-state", state.orbState);
    await expectStaticOrbFrame(orb);
  }

  const auditTrail = dialog.locator("details.assistant-activity--completed");
  await expect(auditTrail).toBeVisible();
  await expect(auditTrail).not.toHaveAttribute("open", "");
  await expect(auditTrail.getByText("已完成 3 个步骤")).toBeVisible();
  await expect(dialog).toContainText("外部说明");
  await expect(
    dialog.getByRole("link", { name: "外部说明", exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "查看价格" }).click();
  await expect(page).toHaveURL(/\/pricing$/u);
  await expectExactViewportWidth(page);
  expectCleanEvidence(evidence, new URL(page.url()).origin);
});

test("workspace preserves the expanded conversation and clears on reload", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop continuity contract");
  await configure(page, testInfo, "reduce");
  const evidence = collectEvidence(page);
  let requestCount = 0;
  const answer = "这条回复只属于当前页面。";
  await page.route(`**${ASSISTANT_CHAT_ENDPOINT}`, async (route) => {
    requestCount += 1;
    expect(route.request().postDataJSON()).toEqual({
      version: "2",
      message: "这条问题只保留在当前页面",
      history: [],
      page: { pathname: "/pricing", search: "" },
    });
    await route.fulfill({
      status: 200,
      contentType: ASSISTANT_STREAM_MEDIA_TYPE,
      body: assistantStreamResponse(answer),
    });
  });

  await page.goto("/pricing");
  await activateAssistantWithStatus(page, () =>
    page.getByRole("button", { name: "打开码多多" }).click(),
  );
  const quickInput = page.getByRole("textbox", { name: "向码多多提问" });
  const question = "这条问题只保留在当前页面";
  await quickInput.fill(question);
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith(ASSISTANT_CHAT_ENDPOINT) &&
      candidate.status() === 200,
  );
  await page.getByRole("button", { name: "发送消息" }).click();
  await response;
  const quickLog = page.getByRole("log", { name: "码多多对话" });
  await expect(quickLog).toContainText(question);
  await expect(quickLog).toContainText(answer);

  await page.getByRole("button", { name: "展开码多多工作区" }).click();
  await expect(page).toHaveURL(/\/assistant$/u);
  const composer = page.getByRole("textbox", { name: "输入问题" });
  await expect(composer).toHaveValue("");
  const messageLog = page.getByRole("log", { name: "码多多对话" });
  await expect(messageLog).toContainText(question);
  await expect(messageLog).toContainText(answer);

  await composer.fill("刷新后也应清空的草稿");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "输入问题" })).toHaveValue("");
  await expect(page.getByRole("log", { name: "码多多对话" })).toHaveCount(0);
  expect(requestCount).toBe(1);
  await expectExactViewportWidth(page);
  await page.unroute(`**${ASSISTANT_CHAT_ENDPOINT}`);
  expectCleanEvidence(evidence, new URL(page.url()).origin);
});

test("mobile quick launcher expands into a scrolling workspace", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile workspace contract");
  await configure(page, testInfo, "reduce");
  const evidence = collectEvidence(page);
  const answer = `移动端长回复：${"工作区内容 ".repeat(140)}`;
  await page.route(`**${ASSISTANT_CHAT_ENDPOINT}`, async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      version: "2",
      message: "移动端滚动与软键盘验证",
      history: [],
      page: null,
    });
    await route.fulfill({
      status: 200,
      contentType: ASSISTANT_STREAM_MEDIA_TYPE,
      body: assistantStreamResponse(answer),
    });
  });

  await page.goto("/");
  await activateAssistantWithStatus(page, () =>
    page.getByRole("button", { name: "打开码多多" }).click(),
  );
  await expectSingleDialog(page, "码多多");
  await page.getByRole("button", { name: "展开码多多工作区" }).click();
  await expect(page).toHaveURL(/\/assistant$/u);
  const workspace = page.getByRole("main", { name: "码多多工作区" });
  const initialBox = await workspace.boundingBox();
  expect(initialBox).not.toBeNull();
  expect(initialBox!.width).toBe(VIEWPORTS.mobile.width);

  const input = page.getByRole("textbox", { name: "输入问题" });
  await input.fill("移动端滚动与软键盘验证");
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith(ASSISTANT_CHAT_ENDPOINT) &&
      candidate.status() === 200,
  );
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await response;
  const messageLog = page.getByRole("log", { name: "码多多对话" });
  await expect(messageLog).toContainText("移动端长回复");
  const scrolling = await messageLog.evaluate((element) => {
    element.scrollTo({ top: element.scrollHeight });
    return {
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
    };
  });
  expect(scrolling.scrollHeight).toBeGreaterThan(scrolling.clientHeight);
  expect(scrolling.scrollTop).toBeGreaterThan(0);

  await input.focus();
  await expect(input).toBeFocused();
  await page.setViewportSize({ width: 390, height: 500 });
  const compactWorkspaceBox = await workspace.boundingBox();
  const composerBox = await input.boundingBox();
  expect(compactWorkspaceBox).not.toBeNull();
  expect(composerBox).not.toBeNull();
  expect(compactWorkspaceBox!.width).toBe(390);
  expect(composerBox!.y + composerBox!.height).toBeLessThanOrEqual(500);
  await expectExactViewportWidth(page);
  await page.unroute(`**${ASSISTANT_CHAT_ENDPOINT}`);
  expectCleanEvidence(evidence, new URL(page.url()).origin);
});

test("all authentication routes use the precision shell without overflow", async ({
  page,
}, testInfo) => {
  await configure(page, testInfo);
  const evidence = collectEvidence(page);

  for (const [url, heading, field] of [
    ["/login", "登录客户控制台", "邮箱"],
    ["/register", "申请客户账号", "姓名"],
    ["/staff/login", "员工安全登录", "员工用户名或邮箱"],
  ] as const) {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.locator('[data-shell-variant="auth"]')).toBeVisible();
    await expect(page.locator(".site-header, .portal-footer")).toHaveCount(0);
    await expectExactViewportWidth(page);
    await tabTo(page, page.getByLabel(field));
  }

  await attachScreenshot(page, testInfo, "auth-shell");
  expectCleanEvidence(evidence, new URL(page.url()).origin);
});

test("authenticated assistant operations and protected auth forms are usable", async ({
  page,
  baseURL,
}, testInfo) => {
  if (!baseURL) throw new Error("baseURL is required");
  await configure(page, testInfo);
  const evidence = collectEvidence(page);
  const credentials = fixtureCredentials();
  await addSignedSession(
    page.context(),
    baseURL,
    "workforce",
    credentials.modelAdminSessionToken,
  );

  await page.goto("/admin/assistant");
  await expect(
    page.getByRole("heading", { name: "AI 助理运营" }),
  ).toBeVisible();
  await expect(page.getByLabel("当前管理员")).toContainText("admin.fixture");
  await expect(page.locator('[data-surface="dark-indigo"]')).toBeVisible();
  await expect(page.locator('[data-surface="bright"]')).toBeVisible();
  await expectExactViewportWidth(page);

  const adminAssistantLink = page.getByRole("link", {
    name: "Agent 管理",
    exact: true,
  });
  if (testInfo.project.name === "mobile") {
    const opener = page.getByRole("button", {
      name: "打开CMS 运营后台导航",
    });
    await tabTo(page, opener);
    await page.keyboard.press("Enter");
  }
  await tabTo(page, adminAssistantLink);
  await attachScreenshot(page, testInfo, "admin-assistant");

  for (const [url, heading, field] of [
    ["/staff/change-password", "修改初始密码", "当前密码"],
  ] as const) {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expectExactViewportWidth(page);
    await tabTo(page, page.getByLabel(field).first());
  }

  expectCleanEvidence(evidence, new URL(page.url()).origin);
});
