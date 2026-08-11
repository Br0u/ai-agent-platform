import { describe, expect, it } from "vitest";
import { productResources } from "./product-content";

describe("product content links", () => {
  it("maps product resources only to retained docs and migrated downloads", () => {
    expect(productResources).toEqual([
      {
        title: "查阅部署文档",
        description: "了解硬件要求与详细安装步骤",
        href: "/docs/deployment",
      },
      {
        title: "硬件兼容列表",
        description: "查看支持的异构算力与 GPU 型号",
        href: "/downloads#dl-mdd2-env",
      },
      {
        title: "API 参考手册",
        description: "平台外部系统集成接口说明",
        href: "/docs/api",
      },
    ]);
  });
});
