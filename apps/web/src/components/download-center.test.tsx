import { readFileSync } from "node:fs";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DownloadResourcePublicDto } from "@/server/downloads/contracts";
import DownloadsPage, { dynamic, revalidate } from "../app/downloads/page";
import { DownloadCenter } from "./download-center";

const mocks = vi.hoisted(() => ({ listPublicResources: vi.fn() }));

vi.mock("@/server/downloads/service", () => ({
  downloadResourceService: { listPublicResources: mocks.listPublicResources },
}));

const resources: DownloadResourcePublicDto[] = [
  {
    key: "yuanqi-brochure",
    name: "元启产品彩页",
    product: "元启",
    category: "materials",
    resourceType: "产品彩页",
    description: "一页了解元启平台的核心能力与适用场景。",
    sortOrder: 10,
    previewPolicy: "public",
    downloadPolicy: "public",
    coverUrl:
      "/api/v1/downloads/yuanqi-brochure/cover?revision=11111111-1111-4111-8111-111111111111",
    pageCount: 8,
    byteSize: 1_572_864,
    updatedAt: "2026-08-16T01:02:03.000Z",
  },
  {
    key: "mdd2-intro",
    name: "码里奥产品介绍",
    product: "码里奥",
    category: "software",
    resourceType: "产品介绍",
    description: "介绍码里奥智能编码能力与企业研发场景。",
    sortOrder: 20,
    previewPolicy: "public",
    downloadPolicy: "contact",
    coverUrl:
      "/api/v1/downloads/mdd2-intro/cover?revision=22222222-2222-4222-8222-222222222222",
    pageCount: 16,
    byteSize: 2_097_152,
    updatedAt: "2026-08-15T01:02:03.000Z",
  },
  {
    key: "vision-whitepaper",
    name: "视觉检索技术白皮书",
    product: "视觉检索智能体",
    category: "whitepapers",
    resourceType: "技术白皮书",
    description: "说明视觉检索智能体的系统架构与落地方式。",
    sortOrder: 30,
    previewPolicy: "contact",
    downloadPolicy: "contact",
    coverUrl:
      "/api/v1/downloads/vision-whitepaper/cover?revision=33333333-3333-4333-8333-333333333333",
    pageCount: 32,
    byteSize: 3_145_728,
    updatedAt: "2026-08-14T01:02:03.000Z",
  },
];

const twentyResources = Array.from({ length: 20 }, (_, index) => ({
  ...resources[index % resources.length]!,
  key: `published-resource-${index + 1}`,
  name: `已发布资源 ${index + 1}`,
  sortOrder: 20 - index,
}));

afterEach(() => {
  mocks.listPublicResources.mockReset();
  window.history.replaceState({}, "", "/downloads");
});

function card(name: string) {
  return screen.getByRole("heading", { level: 3, name }).closest("article")!;
}

function contactTopics(dialog: HTMLElement) {
  const href = within(dialog)
    .getByRole("link", { name: "联系我们" })
    .getAttribute("href")!;
  return new URL(href, "https://example.com").searchParams.getAll("topic");
}

describe("managed download center", () => {
  it("loads the current public catalog on every dynamic server render", async () => {
    mocks.listPublicResources.mockResolvedValue(resources);

    render(await DownloadsPage());

    expect(dynamic).toBe("force-dynamic");
    expect(revalidate).toBe(0);
    expect(mocks.listPublicResources).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "元启产品彩页" })).toBeVisible();
  });

  it("keeps four section shells and shows one neutral empty state only", () => {
    const { container } = render(<DownloadCenter resources={resources} />);
    fireEvent.click(screen.getByRole("button", { name: "展开下载中心目录" }));

    for (const [anchor, heading] of [
      ["dl-materials", "01｜产品资料"],
      ["dl-software", "02｜软件资源下载"],
      ["dl-deployment", "03｜产品部署文档"],
      ["dl-whitepapers", "04｜白皮书与技术资料"],
    ] as const) {
      const section = container.querySelector<HTMLElement>(`#${anchor}`)!;
      expect(
        within(section).getByRole("heading", { level: 2, name: heading }),
      ).toBeVisible();
      expect(
        screen.getByRole("link", { name: heading.slice(3) }),
      ).toHaveAttribute("href", `/downloads#${anchor}`);
    }

    const empty = container.querySelector<HTMLElement>("#dl-deployment")!;
    expect(within(empty).getAllByText("暂无可用资源")).toHaveLength(1);
    expect(empty.querySelectorAll("article")).toHaveLength(0);
    expect(empty).not.toHaveTextContent(/\.pdf|文件名|不可用/u);
  });

  it("renders a populated 20-resource catalog without duplicate cards", () => {
    const { container } = render(
      <DownloadCenter resources={twentyResources} />,
    );

    expect(
      container.querySelectorAll("article[data-download-key]"),
    ).toHaveLength(20);
    for (const resource of twentyResources) {
      expect(
        container.querySelectorAll(`[data-download-key="${resource.key}"]`),
      ).toHaveLength(1);
    }
  });

  it("keeps the resource directory collapsed until requested", () => {
    const { container } = render(<DownloadCenter resources={resources} />);
    const shell = container.querySelector<HTMLElement>(".download-shell")!;

    const toggle = screen.getByRole("button", {
      name: "展开下载中心目录",
    });
    expect(shell).toHaveAttribute("data-directory-collapsed", "true");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("directory-progress-rail")).toBeVisible();

    toggle.focus();
    fireEvent.click(toggle);

    const close = screen.getByRole("button", { name: "收起下载中心目录" });
    expect(shell).toHaveAttribute("data-directory-collapsed", "false");
    expect(close).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByTestId("directory-progress-rail")).toBeNull();

    fireEvent.click(close);
    expect(
      screen.getByRole("button", { name: "展开下载中心目录" }),
    ).toHaveFocus();
  });

  it("restores the original product-to-experience hero", () => {
    const { container } = render(<DownloadCenter resources={resources} />);
    const hero = container.querySelector<HTMLElement>("#dl-hero")!;

    expect(
      within(hero).getByRole("heading", {
        level: 1,
        name: "从产品资料到安装体验，一站式获取华鲲资源",
      }),
    ).toBeVisible();
    expect(hero).toHaveTextContent(
      "下载中心集中提供元启平台、码里奥与行业应用的产品资料、软件安装包、部署文档与技术白皮书，帮助您了解产品能力、获取资源并进入产品体验。",
    );
    expect(hero.querySelectorAll(".download-journey__step")).toHaveLength(4);
    expect(
      within(hero).getAllByRole("link", { name: "了解产品" })[0],
    ).toHaveAttribute("href", "/product");
    expect(
      within(hero).getByRole("link", { name: "获取资料" }),
    ).toHaveAttribute("href", "/downloads#dl-materials");
    expect(
      within(hero).getByRole("link", { name: "安装体验" }),
    ).toHaveAttribute("href", "/downloads#dl-software");
    expect(
      within(hero).getAllByRole("link", { name: "申请体验" })[0],
    ).toHaveAttribute("href", "/trial");
    expect(hero).toHaveTextContent(
      "下载中心是产品推广与客户转化链路的资源入口，资源均与产品价值关联呈现。",
    );
  });

  it("uses the solutions-style mobile directory drawer", async () => {
    const { container } = render(<DownloadCenter resources={resources} />);
    const trigger = screen.getByRole("button", { name: "下载中心目录" });
    const directory = container.querySelector<HTMLElement>(
      ".download-directory",
    )!;

    trigger.focus();
    fireEvent.click(trigger);
    expect(directory).toHaveAttribute("data-mobile-open", "true");
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "下载中心总览" })).toHaveFocus(),
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(directory).toHaveAttribute("data-mobile-open", "false");
    expect(trigger).toHaveFocus();
  });

  it("shows the cover and complete published metadata on every card", () => {
    render(<DownloadCenter resources={resources} />);

    const publicCard = within(card("元启产品彩页"));
    expect(
      publicCard.getByRole("img", { name: "元启产品彩页封面" }),
    ).toHaveAttribute("src", resources[0]!.coverUrl);
    expect(publicCard.getByText("元启", { exact: true })).toBeVisible();
    expect(publicCard.getByText("产品彩页", { exact: true })).toBeVisible();
    expect(publicCard.getByText(resources[0]!.description)).toBeVisible();
    expect(publicCard.getByText("8 页")).toBeVisible();
    expect(publicCard.getByText("1.5 MB")).toBeVisible();
    expect(publicCard.getByText("发布于 2026年8月16日")).toBeVisible();
    expect(publicCard.getByText("可在线预览 · 可直接下载")).toBeVisible();
  });

  it("renders only the actions allowed by each policy", () => {
    render(<DownloadCenter resources={resources} />);

    const open = within(card("元启产品彩页"));
    expect(
      open.getByRole("link", { name: "在线预览元启产品彩页" }),
    ).toHaveAttribute("href", "/downloads/preview/yuanqi-brochure");
    expect(
      open.getByRole("link", { name: "下载 PDF 元启产品彩页" }),
    ).toHaveAttribute("href", "/api/v1/downloads/yuanqi-brochure/download");

    const gated = within(card("码里奥产品介绍"));
    expect(
      gated.getByRole("link", { name: "在线预览码里奥产品介绍" }),
    ).toBeVisible();
    expect(
      gated.getByRole("button", { name: "下载资料码里奥产品介绍" }),
    ).toBeVisible();

    const coverOnly = within(card("视觉检索技术白皮书"));
    expect(coverOnly.queryByRole("link", { name: /在线预览/u })).toBeNull();
    expect(coverOnly.queryByRole("link", { name: /下载 PDF/u })).toBeNull();
    expect(
      coverOnly.getByRole("button", { name: "联系获取视觉检索技术白皮书" }),
    ).toBeVisible();
  });

  it("uses the same accessible contact dialog for both gated cases", async () => {
    render(<DownloadCenter resources={resources} />);
    const firstTrigger = within(card("码里奥产品介绍")).getByRole("button", {
      name: "下载资料码里奥产品介绍",
    });

    fireEvent.click(firstTrigger);
    let dialog = screen.getByRole("dialog", { name: "联系获取资料" });
    expect(
      within(dialog).getByText(
        "“码里奥产品介绍”暂未开放直接下载。请联系我们并说明您的需求，成为客户后可申请获取资料。",
      ),
    ).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "取消" })).toHaveFocus();
    expect(contactTopics(dialog)).toEqual(["申请获取码里奥产品介绍"]);
    expect(window.location.pathname).toBe("/downloads");
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    await waitFor(() => expect(firstTrigger).toHaveFocus());

    const secondTrigger = within(card("视觉检索技术白皮书")).getByRole(
      "button",
      {
        name: "联系获取视觉检索技术白皮书",
      },
    );
    fireEvent.click(secondTrigger);
    dialog = screen.getByRole("dialog", { name: "联系获取资料" });
    expect(
      within(dialog).getByText(
        "“视觉检索技术白皮书”暂未开放直接下载。请联系我们并说明您的需求，成为客户后可申请获取资料。",
      ),
    ).toBeVisible();
    expect(contactTopics(dialog)).toEqual(["申请获取视觉检索技术白皮书"]);
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(secondTrigger).toHaveFocus());

    expect(screen.queryByText(/登录|DRM|禁止截图|防复制/u)).toBeNull();
  });

  it("keeps a special-character resource name in one exact contact topic", () => {
    const specialName = "资料 & #?/";
    render(
      <DownloadCenter resources={[{ ...resources[1]!, name: specialName }]} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: `下载资料${specialName}` }),
    );
    expect(
      contactTopics(screen.getByRole("dialog", { name: "联系获取资料" })),
    ).toEqual([`申请获取${specialName}`]);
  });

  it("uses wide horizontal cards with a mobile stacked fallback", () => {
    const css = readFileSync("src/app/downloads/downloads.css", "utf8");

    expect(css).toMatch(
      /\.download-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0, 1fr\)\);/su,
    );
    expect(css).toMatch(
      /\.download-card\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1\.4fr\) minmax\(180px,\s*0\.85fr\);/su,
    );
    expect(css).toMatch(
      /\.download-card__cover\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1;/su,
    );
    expect(css).toMatch(
      /\.download-card__body\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*1;/su,
    );
    expect(css).toMatch(
      /@media \(max-width:\s*900px\)[\s\S]*?\.download-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/u,
    );
    expect(css).toMatch(
      /@media \(max-width:\s*640px\)[\s\S]*?\.download-card\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[\s\S]*?\.download-card__cover\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*1;[\s\S]*?\.download-card__body\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*2;/u,
    );
    expect(css).toMatch(/:focus-visible/u);
    expect(css).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)/u);
  });

  it("uses the original hero hierarchy without adding decorative sections", () => {
    const css = readFileSync("src/app/downloads/downloads.css", "utf8");

    expect(css).toMatch(
      /\.download-journey\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0, 1fr\)\);/su,
    );
    expect(css).toMatch(/\.download-hero__actions\s*\{[^}]*display:\s*flex;/su);
    expect(css).toMatch(
      /\.download-hero__note\s*\{[^}]*border-left:\s*3px solid/u,
    );
    expect(css).not.toMatch(/\.download-hero__label/u);
  });

  it("keeps the directory rail without reserving a colored collapsed gutter", () => {
    const css = readFileSync("src/app/downloads/downloads.css", "utf8");

    expect(css).toMatch(
      /\.download-shell\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*240px minmax\(0, 1fr\);/su,
    );
    expect(css).toMatch(
      /@media \(min-width:\s*901px\)[\s\S]*?\.download-shell\[data-directory-collapsed="true"\]\s*\{[^}]*grid-template-columns:\s*0 minmax\(0, 1fr\);/u,
    );
    expect(css).toMatch(
      /\.download-directory\s*\{[^}]*position:\s*sticky;[^}]*width:\s*240px;[^}]*border-radius:\s*18px;/su,
    );
    expect(css).toMatch(
      /@media \(max-width:\s*900px\)[\s\S]*?\.download-directory-mobile\s*\{[^}]*display:\s*inline-flex;[\s\S]*?\.download-directory\s*\{[^}]*position:\s*fixed;[^}]*transform:\s*translateX\(-100%\);[\s\S]*?\.download-directory\[data-mobile-open="true"\]\s*\{[^}]*transform:\s*translateX\(0\);/u,
    );
  });

  it("uses the homepage compact footer presentation on every portal route", () => {
    const css = readFileSync(
      "../../packages/ui/src/navigation/navigation.css",
      "utf8",
    );

    expect(css).toContain(
      ".portal-footer__main,\n.portal-footer__meta span:not(:last-child)",
    );
    expect(css).toMatch(
      /\.portal-footer__meta\s*\{[^}]*justify-content:\s*center;[^}]*padding-block:\s*18px;[^}]*border-top:\s*0;/s,
    );
  });

  it("defines contact dialog tokens on the body-level portal root", () => {
    const css = readFileSync("src/app/downloads/downloads.css", "utf8");

    expect(css).toMatch(
      /\.assistant-skill-dialog:has\(\.download-contact-dialog\)\s*\{[^}]*--download-ink:\s*#111a3d;[^}]*--download-muted:\s*#5f6b8c;[^}]*--download-blue:\s*#286cff;[^}]*--download-violet:\s*#7358ea;[^}]*--download-surface:\s*#ffffff;[^}]*--download-line:\s*rgb\(76 108 196 \/ 18%\);/su,
    );
  });
});
