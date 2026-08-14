import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HomeIcon } from "./home-icon";

afterEach(cleanup);

const iconAssets = {
  analytics: ["chart-page", 147, 170],
  clock: ["clock", 171, 169],
  code: ["code", 179, 95],
  cube: ["cube-perspective", 176, 192],
  database: ["database-cylinder-data", 144, 173],
  finance: ["financial-quarter-chart", 167, 175],
  government: ["courthouse", 204, 188],
  inspection: ["engineer-clipboard", 176, 227],
  knowledge: ["book-open", 177, 144],
  "knowledge-search": ["book-search", 130, 160],
  location: ["map-pinned", 156, 154],
  mail: ["mail", 173, 119],
  phone: ["helpline-phone", 171, 178],
  platform: ["layers", 178, 168],
  presentation: ["presentation", 180, 161],
  video: ["cctv", 182, 140],
  workflow: ["workflow-automation", 162, 166],
} as const;

describe("HomeIcon", () => {
  it("uses only local Koboyo assets with the approved slug and dimensions", () => {
    for (const [name, [slug, width, height]] of Object.entries(iconAssets)) {
      const { unmount, container } = render(
        <HomeIcon name={name as keyof typeof iconAssets} />,
      );
      const icon = container.firstElementChild as HTMLElement;
      const image = icon.style.getPropertyValue("--home-icon-image");
      const assetPath = `/assets/home/icons/${slug}.svg`;

      expect(image).toBe(`url("${assetPath}")`);
      expect(image).not.toMatch(/https?:/u);
      expect(icon.style.aspectRatio).toBe(`${width} / ${height}`);
      expect(existsSync(resolve(process.cwd(), `public${assetPath}`))).toBe(
        true,
      );
      unmount();
    }
  });
});
