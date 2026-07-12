import { describe, expect, it } from "vitest";

import {
  formatShanghaiDateTime,
  parsePositivePage,
  parseShanghaiDateBoundary,
} from "./admin-page-values";

describe("admin page values", () => {
  it.each([
    [undefined, 1],
    ["", 1],
    ["Infinity", 1],
    ["2.5", 1],
    ["0", 1],
    ["-2", 1],
    ["10001", 1],
    ["3", 3],
  ])("parses page %s as %s", (raw, expected) => {
    expect(parsePositivePage(raw)).toBe(expected);
  });

  it("parses date-only audit boundaries in the portal business timezone", () => {
    expect(parseShanghaiDateBoundary("2026-07-12")?.toISOString()).toBe(
      "2026-07-11T16:00:00.000Z",
    );
    expect(parseShanghaiDateBoundary("2026-07-12", true)?.toISOString()).toBe(
      "2026-07-12T15:59:59.999Z",
    );
    expect(parseShanghaiDateBoundary("not-a-date")).toBeUndefined();
  });

  it("formats stored UTC timestamps as Asia/Shanghai time", () => {
    expect(formatShanghaiDateTime("2026-07-12T00:00:00.000Z")).toBe(
      "2026-07-12 08:00:00",
    );
  });
});
