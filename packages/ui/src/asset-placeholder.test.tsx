import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssetPlaceholder } from "./asset-placeholder";

describe("AssetPlaceholder", () => {
  it("keeps the future asset ratio and explains what must be replaced", () => {
    render(<AssetPlaceholder label="产品真实截图" ratio="16 / 10" />);

    expect(screen.getByRole("figure", { name: "产品真实截图" })).toHaveStyle({
      aspectRatio: "16 / 10",
    });
    expect(screen.getByText("[ 产品真实截图 · 待替换 ]")).toBeVisible();
  });
});
