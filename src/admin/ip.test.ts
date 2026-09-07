import { describe, expect, it } from "vitest";

import { matchesBan, parseBanTarget, parseCIDR, parseIP } from "./ip";

describe("IP parsing and ban targets", () => {
  it("parses and normalizes IPv4 addresses", () => {
    expect(parseIP("010.000.000.001")).toEqual({
      kind: "v4",
      bytes: new Uint8Array([10, 0, 0, 1]),
      text: "10.0.0.1",
    });
    expect(parseBanTarget("010.000.000.001")).toEqual({
      type: "single",
      normalized: "10.0.0.1",
    });
  });

  it("parses and normalizes IPv6 addresses", () => {
    expect(parseIP("2001:0DB8::1")?.text).toBe("2001:db8::1");
    expect(parseBanTarget("2001:0DB8::1")).toEqual({
      type: "single",
      normalized: "2001:db8::1",
    });
  });

  it("reports the effective IPv4 CIDR range", () => {
    const parsed = parseCIDR("192.168.1.99/24");
    expect(parsed).toMatchObject({
      kind: "v4",
      prefix: 24,
      rangeStart: "192.168.1.0",
      rangeEnd: "192.168.1.255",
      display: "192.168.1.0/24 (192.168.1.0 - 192.168.1.255)",
    });
    expect(parseBanTarget("192.168.1.99/24")).toEqual({
      type: "cidr",
      normalized: "192.168.1.0/24",
    });
    expect(matchesBan("192.168.1.0", "192.168.1.0/24")).toBe(true);
    expect(matchesBan("192.168.1.255", "192.168.1.0/24")).toBe(true);
    expect(matchesBan("192.168.2.1", "192.168.1.0/24")).toBe(false);
  });

  it("matches IPv6 CIDR ranges at /64 and /128 boundaries", () => {
    expect(matchesBan("2001:db8:0:0:ffff::1", "2001:db8::/64")).toBe(true);
    expect(matchesBan("2001:db8:0:1::1", "2001:db8::/64")).toBe(false);
    expect(matchesBan("2001:db8::1", "2001:db8::1/128")).toBe(true);
    expect(matchesBan("2001:db8::2", "2001:db8::1/128")).toBe(false);
  });

  it("supports overlapping ranges and single IP targets", () => {
    expect(matchesBan("10.10.10.10", "10.0.0.0/8")).toBe(true);
    expect(matchesBan("10.10.10.10", "10.10.0.0/16")).toBe(true);
    expect(matchesBan("10.10.10.10", "10.10.10.10")).toBe(true);
    expect(matchesBan("10.10.10.11", "10.10.10.10")).toBe(false);
  });

  it("does not cross-match IPv4 and IPv6", () => {
    expect(matchesBan("192.0.2.1", "::/0")).toBe(false);
    expect(matchesBan("2001:db8::1", "0.0.0.0/0")).toBe(false);
  });

  it("rejects invalid addresses, prefixes, mixed forms, and zones", () => {
    for (const input of [
      "256.0.0.1",
      "192.168.1.1/33",
      "2001:db8::1/129",
      "2001:db8::1%eth0",
      "2001:db8::192.0.2.1",
      "192.168.1.1/24/1",
      "192.168.1.1/not-a-prefix",
    ]) {
      expect(parseCIDR(input)).toBeNull();
      expect(parseBanTarget(input)).toHaveProperty("error");
    }
  });

  it("never matches an unknown client address", () => {
    expect(matchesBan("unknown", "0.0.0.0/0")).toBe(false);
    expect(matchesBan("unknown", "::/0")).toBe(false);
    expect(matchesBan("", "192.168.1.1")).toBe(false);
  });
});
