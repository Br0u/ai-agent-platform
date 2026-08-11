import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ContactPage, { metadata } from "./page";

describe("ContactPage", () => {
  it("逐字呈现原型联系信息与三个业务入口", async () => {
    render(await ContactPage({ searchParams: Promise.resolve({}) }));

    expect(metadata).toMatchObject({
      title: "联系我们 · 华鲲",
      description:
        "无论是产品咨询、方案交流、体验申请还是商务合作，留下您的需求，我们的顾问将尽快与您联系。",
    });
    expect(screen.getByText("联系我们｜商务咨询")).toBeVisible();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "期待与您交流，共创企业 AI 未来",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "无论是产品咨询、方案交流、体验申请还是商务合作，留下您的需求，我们的顾问将尽快与您联系。",
      ),
    ).toBeVisible();
    const values = screen.getByRole("list", { name: "咨询类型" });
    expect(within(values).getAllByRole("listitem")).toHaveLength(4);
    for (const value of ["产品咨询", "方案交流", "体验申请", "商务合作"]) {
      expect(within(values).getByText(value)).toBeVisible();
    }

    const information = screen.getByRole("region", { name: "联系信息" });
    for (const text of [
      "四川省成都市双流区新程南一路 19 号 · AI 创新中心 F6 栋",
      "商务合作邮箱待确认",
      "客服热线待确认",
      "工作日 9:00 – 18:00",
    ]) {
      expect(within(information).getByText(text)).toBeVisible();
    }

    expect(
      screen.getByRole("button", { name: "返回上一个浏览页面" }),
    ).toHaveTextContent("← 返回上一步");
    expect(screen.getByRole("link", { name: "进入产品中心" })).toHaveAttribute(
      "href",
      "/product",
    );
    expect(screen.getByRole("link", { name: "查看解决方案" })).toHaveAttribute(
      "href",
      "/solutions",
    );
    expect(screen.getByRole("link", { name: "了解合作伙伴" })).toHaveAttribute(
      "href",
      "/partners",
    );
  });

  it("安全显示咨询主题并忽略空主题", async () => {
    const { rerender } = render(
      await ContactPage({
        searchParams: Promise.resolve({ topic: "体验申请咨询" }),
      }),
    );

    expect(screen.getByText("当前咨询主题：")).toHaveTextContent(
      "当前咨询主题：体验申请咨询",
    );

    rerender(
      await ContactPage({ searchParams: Promise.resolve({ topic: "   " }) }),
    );
    expect(screen.queryByText("当前咨询主题：")).not.toBeInTheDocument();
  });
});
