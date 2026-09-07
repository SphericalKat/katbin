export type IPKind = "v4" | "v6";

export type ParsedIP = {
  kind: IPKind;
  bytes: Uint8Array;
  text: string;
};

export type ParsedCIDR = {
  kind: IPKind;
  networkBytes: Uint8Array;
  prefix: number;
  rangeStart: string;
  rangeEnd: string;
  display: string;
};

export type BanTarget = { type: "single" | "cidr"; normalized: string } | { error: string };

const INVALID_TARGET = "Invalid IP address or CIDR range";

function parseIPv4(input: string): ParsedIP | null {
  const parts = input.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) {
    return null;
  }

  const bytes = new Uint8Array(4);
  for (let index = 0; index < parts.length; index += 1) {
    const value = Number(parts[index]);
    if (!Number.isSafeInteger(value) || value > 255) {
      return null;
    }
    bytes[index] = value;
  }

  return { kind: "v4", bytes, text: Array.from(bytes).join(".") };
}

function parseIPv6(input: string): ParsedIP | null {
  if (!input || input.includes(".") || input.includes("%")) {
    return null;
  }

  const compression = input.indexOf("::");
  const hasCompression = compression !== -1;
  if (hasCompression && compression !== input.lastIndexOf("::")) {
    return null;
  }

  const left = hasCompression ? input.slice(0, compression) : input;
  const right = hasCompression ? input.slice(compression + 2) : "";
  const leftGroups = left ? left.split(":") : [];
  const rightGroups = right ? right.split(":") : [];
  const groups = [...leftGroups, ...rightGroups];

  if (
    groups.some((group) => !/^[0-9a-fA-F]{1,4}$/.test(group)) ||
    (hasCompression ? groups.length >= 8 : groups.length !== 8)
  ) {
    return null;
  }

  const parsedGroups = leftGroups.map((group) => Number.parseInt(group, 16));
  if (hasCompression) {
    parsedGroups.push(...Array.from({ length: 8 - groups.length }, () => 0));
  }
  parsedGroups.push(...rightGroups.map((group) => Number.parseInt(group, 16)));

  if (parsedGroups.length !== 8) {
    return null;
  }

  const bytes = new Uint8Array(16);
  for (let index = 0; index < parsedGroups.length; index += 1) {
    bytes[index * 2] = parsedGroups[index] >> 8;
    bytes[index * 2 + 1] = parsedGroups[index] & 0xff;
  }

  return { kind: "v6", bytes, text: formatIPv6(bytes) };
}

function formatIPv6(bytes: Uint8Array): string {
  const groups = Array.from({ length: 8 }, (_, index) =>
    ((bytes[index * 2] << 8) | bytes[index * 2 + 1]).toString(16),
  );

  let bestStart = -1;
  let bestLength = 0;
  let runStart = -1;
  for (let index = 0; index <= groups.length; index += 1) {
    if (index < groups.length && groups[index] === "0") {
      if (runStart === -1) runStart = index;
      continue;
    }

    if (runStart !== -1) {
      const length = index - runStart;
      if (length > bestLength) {
        bestStart = runStart;
        bestLength = length;
      }
      runStart = -1;
    }
  }

  if (bestLength < 2) {
    return groups.join(":");
  }

  const left = groups.slice(0, bestStart).join(":");
  const right = groups.slice(bestStart + bestLength).join(":");
  return `${left}::${right}`;
}

function formatIP(kind: IPKind, bytes: Uint8Array): string {
  return kind === "v4" ? Array.from(bytes).join(".") : formatIPv6(bytes);
}

export function parseIP(input: string): ParsedIP | null {
  if (typeof input !== "string" || !input) {
    return null;
  }
  return input.includes(":") ? parseIPv6(input) : parseIPv4(input);
}

export function parseCIDR(input: string): ParsedCIDR | null {
  if (typeof input !== "string" || !input) {
    return null;
  }

  const slash = input.indexOf("/");
  const hasPrefix = slash !== -1;
  if (hasPrefix && input.indexOf("/", slash + 1) !== -1) {
    return null;
  }

  const address = hasPrefix ? input.slice(0, slash) : input;
  const parsed = parseIP(address);
  if (!parsed) {
    return null;
  }

  const maxPrefix = parsed.kind === "v4" ? 32 : 128;
  let prefix = maxPrefix;
  if (hasPrefix) {
    const prefixText = input.slice(slash + 1);
    if (!/^\d+$/.test(prefixText)) {
      return null;
    }
    prefix = Number(prefixText);
    if (!Number.isSafeInteger(prefix) || prefix < 0 || prefix > maxPrefix) {
      return null;
    }
  }

  const networkBytes = new Uint8Array(parsed.bytes);
  const fullBytes = Math.floor(prefix / 8);
  const remainingBits = prefix % 8;
  if (fullBytes < networkBytes.length && remainingBits !== 0) {
    networkBytes[fullBytes] &= 0xff << (8 - remainingBits);
  }
  for (
    let index = fullBytes + (remainingBits === 0 ? 0 : 1);
    index < networkBytes.length;
    index += 1
  ) {
    networkBytes[index] = 0;
  }

  const rangeEndBytes = new Uint8Array(networkBytes);
  if (remainingBits !== 0) {
    rangeEndBytes[fullBytes] |= 0xff >> remainingBits;
  }
  for (
    let index = fullBytes + (remainingBits === 0 ? 0 : 1);
    index < rangeEndBytes.length;
    index += 1
  ) {
    rangeEndBytes[index] = 0xff;
  }

  const rangeStart = formatIP(parsed.kind, networkBytes);
  const rangeEnd = formatIP(parsed.kind, rangeEndBytes);
  const display = `${rangeStart}/${prefix} (${rangeStart} - ${rangeEnd})`;
  return {
    kind: parsed.kind,
    networkBytes,
    prefix,
    rangeStart,
    rangeEnd,
    display,
  };
}

export function parseBanTarget(input: string): BanTarget {
  if (typeof input !== "string" || !input) {
    return { error: INVALID_TARGET };
  }

  if (input.includes("/")) {
    const parsed = parseCIDR(input);
    if (!parsed) {
      return { error: INVALID_TARGET };
    }
    return {
      type: "cidr",
      normalized: `${parsed.rangeStart}/${parsed.prefix}`,
    };
  }

  const parsed = parseIP(input);
  return parsed ? { type: "single", normalized: parsed.text } : { error: INVALID_TARGET };
}

export function matchesBan(clientIp: string, banTarget: string): boolean {
  const client = parseIP(clientIp);
  const target = parseCIDR(banTarget);
  if (!client || !target || client.kind !== target.kind) {
    return false;
  }

  const fullBytes = Math.floor(target.prefix / 8);
  for (let index = 0; index < fullBytes; index += 1) {
    if (client.bytes[index] !== target.networkBytes[index]) {
      return false;
    }
  }

  const remainingBits = target.prefix % 8;
  if (remainingBits === 0) {
    return true;
  }

  const mask = 0xff << (8 - remainingBits);
  return (client.bytes[fullBytes] & mask) === (target.networkBytes[fullBytes] & mask);
}
