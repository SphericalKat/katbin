import { describe, expect, it } from "vitest";

import { adminNoCache, getClientIp, isAdminUser, isCanonicalHost, verifyAccessJwt } from "./auth";

const encoder = new TextEncoder();

function encodeBase64Url(value: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof value === "string"
      ? encoder.encode(value)
      : value instanceof Uint8Array
        ? value
        : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function createToken(
  privateKey: CryptoKey,
  claims: Record<string, unknown>,
  header: Record<string, unknown> = { alg: "RS256", kid: "test-key" },
): Promise<string> {
  const encodedHeader = encodeBase64Url(JSON.stringify(header));
  const encodedPayload = encodeBase64Url(JSON.stringify(claims));
  const data = encoder.encode(`${encodedHeader}.${encodedPayload}`);

  return crypto.subtle
    .sign({ name: "RSASSA-PKCS1-v1_5" }, privateKey, data)
    .then((signature) => `${encodedHeader}.${encodedPayload}.${encodeBase64Url(signature)}`);
}

describe("admin authentication helpers", () => {
  it("gets the Cloudflare client IP and ignores forwarded headers", () => {
    expect(getClientIp(new Headers({ "CF-Connecting-IP": " 203.0.113.4 " }))).toBe("203.0.113.4");
    expect(getClientIp(new Headers())).toBe("unknown");
    expect(
      getClientIp(
        new Headers({ "X-Forwarded-For": "198.51.100.1", Forwarded: "for=198.51.100.2" }),
      ),
    ).toBe("unknown");
  });

  it("accepts only the canonical host outside local and test environments", () => {
    expect(isCanonicalHost("preview.pages.dev", { ENVIRONMENT: "local" })).toBe(true);
    expect(isCanonicalHost("preview.pages.dev", { ENVIRONMENT: "test" })).toBe(true);
    expect(isCanonicalHost("KATB.IN:443", { CANONICAL_HOST: "katb.in" })).toBe(true);
    expect(isCanonicalHost("katb.in", { CANONICAL_HOST: "KATB.IN:443" })).toBe(true);
    expect(isCanonicalHost("preview.pages.dev", { CANONICAL_HOST: "katb.in" })).toBe(false);
  });

  it("matches only stable integer IDs in the admin allowlist", () => {
    expect(isAdminUser(42, { ADMIN_USER_IDS: "7, 42, 99" })).toBe(true);
    expect(isAdminUser(4, { ADMIN_USER_IDS: "42" })).toBe(false);
    expect(isAdminUser(null, { ADMIN_USER_IDS: "42" })).toBe(false);
    expect(isAdminUser(42, {})).toBe(false);
  });

  it("returns no-store cache headers", () => {
    expect(adminNoCache()).toEqual({ "Cache-Control": "no-store" });
  });

  it("verifies a Cloudflare Access JWT and rejects invalid claims or signatures", async () => {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    const jwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const issuer = "https://access.example.com";
    const audience = "katbin-audience";
    const now = 1_700_000_000;
    const claims = { iss: issuer, aud: audience, exp: now + 60, email: "admin@example.com" };
    const jwksFetch = async (url: string) => {
      expect(url).toBe(`${issuer}/cdn-cgi/access/certs`);
      return new Response(JSON.stringify({ keys: [{ ...jwk, kid: "test-key", alg: "RS256" }] }));
    };

    const validToken = await createToken(keyPair.privateKey, claims);
    await expect(
      verifyAccessJwt(validToken, { issuer, audience, now, jwksFetch }),
    ).resolves.toEqual({ valid: true, email: "admin@example.com" });

    const wrongAudience = await createToken(keyPair.privateKey, { ...claims, aud: "other" });
    await expect(
      verifyAccessJwt(wrongAudience, { issuer, audience, now, jwksFetch }),
    ).resolves.toMatchObject({ valid: false });

    const wrongIssuer = await createToken(keyPair.privateKey, {
      ...claims,
      iss: "https://other.example.com",
    });
    await expect(
      verifyAccessJwt(wrongIssuer, { issuer, audience, now, jwksFetch }),
    ).resolves.toMatchObject({ valid: false });

    const expired = await createToken(keyPair.privateKey, { ...claims, exp: now });
    await expect(
      verifyAccessJwt(expired, { issuer, audience, now, jwksFetch }),
    ).resolves.toMatchObject({ valid: false });

    const [header, payload, signature] = validToken.split(".");
    const badSignature = `${header}.${payload}.${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
    await expect(
      verifyAccessJwt(badSignature, { issuer, audience, now, jwksFetch }),
    ).resolves.toMatchObject({ valid: false });
  });
});
