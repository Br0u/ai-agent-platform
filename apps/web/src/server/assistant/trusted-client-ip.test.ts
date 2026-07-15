import { describe, expect, it } from "vitest";

import {
  InvalidTrustedClientIpError,
  parseTrustedClientIp,
  resolveTrustedClientIp,
} from "./trusted-client-ip";

describe("trusted assistant client IP", () => {
  it("ignores every forwarding header when proxy trust is disabled", () => {
    const headers = new Headers({
      "x-real-ip": "203.0.113.10",
      "x-forwarded-for": "198.51.100.1, 198.51.100.2",
      forwarded: "for=192.0.2.1",
    });

    expect(resolveTrustedClientIp(headers, false)).toBeUndefined();
  });

  it.each([
    ["IPv4", "203.0.113.10", "203.0.113.10"],
    ["compressed IPv6", "2001:db8::1", "2001:db8::1"],
    ["expanded IPv6", "2001:0db8:0000:0000:0000:0000:0000:0001", "2001:db8::1"],
    ["uppercase IPv6", "2001:DB8::A", "2001:db8::a"],
  ])("accepts one canonicalizable %s X-Real-IP", (_name, raw, expected) => {
    expect(
      resolveTrustedClientIp(new Headers({ "x-real-ip": raw }), true),
    ).toBe(expected);
  });

  it("returns no IP when trusted proxy mode receives no X-Real-IP", () => {
    expect(resolveTrustedClientIp(new Headers(), true)).toBeUndefined();
  });

  it.each([
    ["comma chain", "203.0.113.10, 198.51.100.4"],
    ["merged duplicate", "203.0.113.10, 203.0.113.11"],
    ["embedded whitespace", "2001:db8:: 1"],
    ["invalid IPv4", "203.0.113.999"],
    ["bracketed IPv6", "[2001:db8::1]"],
    ["IPv6 zone", "fe80::1%en0"],
    ["IPv4-mapped dotted IPv6", "::ffff:192.0.2.1"],
    ["IPv4-mapped hexadecimal IPv6", "::ffff:c000:201"],
  ])("rejects an ambiguous or invalid %s", (_name, value) => {
    expect(() =>
      resolveTrustedClientIp(new Headers({ "x-real-ip": value }), true),
    ).toThrow(InvalidTrustedClientIpError);
  });

  it.each([" 203.0.113.10", "203.0.113.10 "])(
    "rejects raw outer whitespace before the Fetch Headers layer normalizes it",
    (value) => {
      expect(() => parseTrustedClientIp(value)).toThrow(
        InvalidTrustedClientIpError,
      );
    },
  );

  it("never falls back to X-Forwarded-For", () => {
    expect(
      resolveTrustedClientIp(
        new Headers({ "x-forwarded-for": "203.0.113.10" }),
        true,
      ),
    ).toBeUndefined();
  });
});
