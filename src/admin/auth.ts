type AdminEnvironment = {
  CANONICAL_HOST?: string;
  ENVIRONMENT?: string;
};

type AccessJwtOptions = {
  issuer: string;
  audience: string;
  jwksFetch: (url: string) => Promise<Response>;
  jwksUrl?: string;
  now?: number;
};

type JsonObject = Record<string, unknown>;

const invalid = (error: string): { valid: false; error: string } => ({ valid: false, error });

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeBase64Url(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(normalized + padding);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function stripPort(host: string): string {
  const normalized = host.trim().toLowerCase();

  if (normalized.startsWith("[")) {
    const closingBracket = normalized.indexOf("]");
    return closingBracket === -1 ? normalized : normalized.slice(1, closingBracket);
  }

  const firstColon = normalized.indexOf(":");
  const lastColon = normalized.lastIndexOf(":");
  return firstColon !== -1 && firstColon === lastColon
    ? normalized.slice(0, lastColon)
    : normalized;
}

export function getClientIp(headers: Headers): string {
  return headers.get("CF-Connecting-IP")?.trim() || "unknown";
}

export function isCanonicalHost(host: string, env: AdminEnvironment): boolean {
  if (env.ENVIRONMENT === "local" || env.ENVIRONMENT === "test") {
    return true;
  }

  if (!env.CANONICAL_HOST) {
    return false;
  }

  return stripPort(host) === stripPort(env.CANONICAL_HOST);
}

export async function verifyAccessJwt(
  token: string,
  opts: AccessJwtOptions,
): Promise<{ valid: boolean; email?: string; error?: string }> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
      return invalid("Invalid compact JWS");
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedHeader))) as unknown;
    const payload = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(encodedPayload)),
    ) as unknown;

    if (!isJsonObject(header) || !isJsonObject(payload)) {
      return invalid("Invalid JWT claims");
    }

    if (header.alg !== "RS256") {
      return invalid("Unsupported JWT algorithm");
    }

    if (typeof header.kid !== "undefined" && typeof header.kid !== "string") {
      return invalid("Invalid JWT key id");
    }

    if (payload.iss !== opts.issuer) {
      return invalid("Invalid JWT issuer");
    }

    const audience = payload.aud;
    const audienceMatches =
      (typeof audience === "string" && audience === opts.audience) ||
      (Array.isArray(audience) &&
        audience.some((value) => typeof value === "string" && value === opts.audience));
    if (!audienceMatches) {
      return invalid("Invalid JWT audience");
    }

    const now = opts.now ?? Math.floor(Date.now() / 1000);
    if (!Number.isFinite(now)) {
      return invalid("Invalid validation time");
    }

    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp) || payload.exp <= now) {
      return invalid("Expired JWT");
    }

    if (
      typeof payload.nbf !== "undefined" &&
      (typeof payload.nbf !== "number" || !Number.isFinite(payload.nbf) || payload.nbf > now)
    ) {
      return invalid("JWT is not yet valid");
    }

    const issuer = opts.issuer.replace(/\/+$/, "");
    const jwksResponse = await opts.jwksFetch(opts.jwksUrl ?? `${issuer}/cdn-cgi/access/certs`);
    if (!jwksResponse.ok) {
      return invalid("Unable to fetch JWKS");
    }

    const jwks = (await jwksResponse.json()) as unknown;
    if (!isJsonObject(jwks) || !Array.isArray(jwks.keys)) {
      return invalid("Invalid JWKS");
    }

    const keyId = typeof header.kid === "string" ? header.kid : undefined;
    const keys = jwks.keys.filter((key): key is JsonObject => {
      if (!isJsonObject(key) || key.kty !== "RSA") {
        return false;
      }
      if (typeof key.alg === "string" && key.alg !== "RS256") {
        return false;
      }
      return keyId === undefined || key.kid === keyId;
    });

    if (keys.length === 0) {
      return invalid("JWT signing key not found");
    }

    const signature = decodeBase64Url(encodedSignature);
    const signedData = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
    let signatureValid = false;

    for (const key of keys) {
      if (typeof key.n !== "string" || typeof key.e !== "string") {
        continue;
      }

      try {
        const cryptoKey = await crypto.subtle.importKey(
          "jwk",
          key as JsonWebKey,
          { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
          false,
          ["verify"],
        );
        signatureValid = await crypto.subtle.verify(
          { name: "RSASSA-PKCS1-v1_5" },
          cryptoKey,
          signature,
          signedData,
        );
      } catch {
        signatureValid = false;
      }

      if (signatureValid) {
        break;
      }
    }

    if (!signatureValid) {
      return invalid("Invalid JWT signature");
    }

    return {
      valid: true,
      ...(typeof payload.email === "string" ? { email: payload.email } : {}),
    };
  } catch {
    return invalid("Invalid JWT");
  }
}

export function isAdminUser(userId: number | null, env: { ADMIN_USER_IDS?: string }): boolean {
  if (userId === null || !Number.isSafeInteger(userId) || !env.ADMIN_USER_IDS) {
    return false;
  }

  return env.ADMIN_USER_IDS.split(",").some((id) => id.trim() === String(userId));
}

export function adminNoCache(): Record<string, string> {
  return { "Cache-Control": "no-store" };
}
