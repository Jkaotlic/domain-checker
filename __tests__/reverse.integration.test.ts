/**
 * Integration-style tests for reverseLookup with mocked dns.promises.reverse and fetch.
 *
 * We mock  module and  to drive both the PTR path
 * and the HTTP fallback path (crt.sh).
 */

jest.mock("dns/promises", () => {
  const mock = {
    reverse: jest.fn(),
  };
  return {
    __esModule: true,
    default: mock,
    reverse: mock.reverse,
  };
});

import dnsPromises from "dns/promises";
import { reverseLookup } from "../lib/reverse";

const dnsMock = dnsPromises as unknown as { reverse: jest.Mock };

describe("reverseLookup (PTR + crt.sh fallback)", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (global as any).fetch = jest.fn();
  });

  test("returns PTR results when dns.promises.reverse succeeds", async () => {
    // dns.reverse returns mixed-case hostnames; reverseLookup normalizes them
    dnsMock.reverse.mockResolvedValueOnce(["HOST1.EXAMPLE.COM", "other.example.com"]);

    const res = await reverseLookup("1.2.3.4");
    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBeGreaterThan(0);
    // Should contain normalized host (lowercased, validated)
    expect(res.some((h) => h.includes("example.com"))).toBe(true);
    expect(dnsMock.reverse).toHaveBeenCalledWith("1.2.3.4");
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  test("falls back to crt.sh when PTR lookup fails or times out", async () => {
    // Make PTR throw
    dnsMock.reverse.mockRejectedValueOnce(new Error("PTR failed"));

    // Mock fetch to return crt.sh-like JSON
    (global as any).fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { common_name: "site.example.com", name_value: "alt.example.com\nsite.example.com" },
      ],
    });

    const res = await reverseLookup("5.6.7.8");
    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBeGreaterThan(0);
    // Should include domains discovered from common_name/name_value
    expect(res).toEqual(
      expect.arrayContaining([expect.stringMatching(/example\.com$/)])
    );
    expect(dnsMock.reverse).toHaveBeenCalledWith("5.6.7.8");
    expect((global as any).fetch).toHaveBeenCalled();
  });

  test("returns empty array when both PTR and crt.sh fallback fail", async () => {
    dnsMock.reverse.mockRejectedValueOnce(new Error("PTR failed"));
    (global as any).fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ([]),
    });

    const res = await reverseLookup("9.9.9.9");
    expect(Array.isArray(res)).toBe(true);
    expect(res).toEqual([]);
    expect(dnsMock.reverse).toHaveBeenCalled();
    expect((global as any).fetch).toHaveBeenCalled();
  });
});
