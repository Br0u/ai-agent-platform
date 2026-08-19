import { describe, expect, it } from "vitest";

import {
  filterPublicEntries,
  isPublicEntryVisible,
} from "./public-entry-policy";

describe("public entry policy", () => {
  it("hides only local trial routes, including query and hash variants", () => {
    expect(isPublicEntryVisible("/trial")).toBe(false);
    expect(isPublicEntryVisible("/trial?source=home")).toBe(false);
    expect(isPublicEntryVisible("/trial#apply")).toBe(false);
    expect(isPublicEntryVisible("/contact?topic=官网咨询")).toBe(true);
    expect(isPublicEntryVisible("https://example.com/trial")).toBe(true);
  });

  it("filters without changing the supplied order or array", () => {
    const entries = [
      { label: "产品", href: "/product" },
      { label: "申请体验", href: "/trial?source=home" },
      { label: "联系我们", href: "/contact?topic=官网咨询" },
    ] as const;

    expect(filterPublicEntries(entries)).toEqual([
      { label: "产品", href: "/product" },
      { label: "联系我们", href: "/contact?topic=官网咨询" },
    ]);
    expect(entries).toHaveLength(3);
  });
});
