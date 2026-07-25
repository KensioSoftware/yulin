import { DnsMessageFormatError } from "../error/dns-message.error.js";

const ipv4ByteCount = 4;
const decimalPattern = /^\d+$/u;
const ipv6GroupCount = 8;

/**
 * Encode an IPv4 address as A record RDATA: four bytes, network order.
 */
export function encodeDnsARdata(address: string): Uint8Array {
  const parts = address.split(".");

  if (parts.length !== ipv4ByteCount) {
    throw new DnsMessageFormatError(
      `Cannot encode ${address} as an A record: expected four dot-separated octets`,
    );
  }

  return Uint8Array.from(parts, (part) => parseOctet(address, part));
}

/**
 * Encode an IPv6 address as AAAA record RDATA: sixteen bytes, network order.
 *
 * Supports the `::` shorthand for a run of zero groups. Addresses written with
 * a trailing IPv4 part, such as `::ffff:127.0.0.1`, are not supported: sim
 * Route53 has no use for them and rejecting them keeps the parser small.
 */
export function encodeDnsAaaaRdata(address: string): Uint8Array {
  const groups = expandIpv6Groups(address);
  const rdata = new Uint8Array(ipv6GroupCount * 2);
  const view = new DataView(rdata.buffer);

  for (const [index, group] of groups.entries()) {
    view.setUint16(index * 2, parseGroup(address, group));
  }

  return rdata;
}

function expandIpv6Groups(address: string): readonly string[] {
  const shorthandIndex = address.indexOf("::");

  if (shorthandIndex === -1) {
    return exactGroups(address, address.split(":"));
  }

  if (address.includes("::", shorthandIndex + 2)) {
    throw new DnsMessageFormatError(
      `Cannot encode ${address} as an AAAA record: "::" may appear only once`,
    );
  }

  const leading = splitGroups(address.slice(0, shorthandIndex));
  const trailing = splitGroups(address.slice(shorthandIndex + 2));
  const zeroCount = ipv6GroupCount - leading.length - trailing.length;

  if (zeroCount < 1) {
    throw new DnsMessageFormatError(
      `Cannot encode ${address} as an AAAA record: "::" must stand for at least one zero group`,
    );
  }

  return [
    ...leading,
    ...Array.from({ length: zeroCount }, () => "0"),
    ...trailing,
  ];
}

function splitGroups(part: string): readonly string[] {
  if (part.length === 0) {
    return [];
  }

  return part.split(":");
}

function exactGroups(
  address: string,
  groups: readonly string[],
): readonly string[] {
  if (groups.length !== ipv6GroupCount) {
    throw new DnsMessageFormatError(
      `Cannot encode ${address} as an AAAA record: expected ${String(ipv6GroupCount)} groups`,
    );
  }

  return groups;
}

function parseOctet(address: string, part: string): number {
  // Matched against digits before conversion because Number() also accepts
  // hexadecimal, exponent and signed forms, so "0x10" or "1e2" would otherwise
  // encode as some other octet instead of being rejected.
  if (!decimalPattern.test(part)) {
    throw new DnsMessageFormatError(
      `Cannot encode ${address} as an A record: ${part} is not an octet`,
    );
  }

  const octet = Number(part);

  if (octet > 255) {
    throw new DnsMessageFormatError(
      `Cannot encode ${address} as an A record: ${part} is not an octet`,
    );
  }

  return octet;
}

function parseGroup(address: string, group: string): number {
  if (!/^[0-9a-f]{1,4}$/iu.test(group)) {
    throw new DnsMessageFormatError(
      `Cannot encode ${address} as an AAAA record: ${group} is not a hex group`,
    );
  }

  return Number.parseInt(group, 16);
}
