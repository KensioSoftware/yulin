import { BlockList, isIP } from "node:net";

import type { SimIamValueComparison } from "./sim-iam-value-comparison.js";

type AddressFamily = "ipv4" | "ipv6";

/**
 * The family of one address, if it is an address.
 */
function familyOf(address: string): AddressFamily | undefined {
  const version = isIP(address);

  if (version === 4) {
    return "ipv4";
  }

  return version === 6 ? "ipv6" : undefined;
}

/**
 * A range of addresses, and the family it holds.
 */
interface AddressRange {
  readonly addresses: BlockList;
  readonly family: AddressFamily;
}

/**
 * Read a policy value as the range of addresses it names.
 *
 * AWS takes CIDR notation, and reads an address with no prefix as a range of
 * one (`/32` for IPv4, `/128` for IPv6).
 */
function rangeOf(range: string): AddressRange | undefined {
  const [address = "", prefixText, ...rest] = range.trim().split("/");
  const family = familyOf(address);

  if (family === undefined || rest.length > 0) {
    return undefined;
  }

  const widest = family === "ipv4" ? 32 : 128;
  const prefix = prefixText === undefined ? widest : Number(prefixText);

  if (
    prefixText !== undefined &&
    (!/^\d+$/u.test(prefixText) || prefix > widest)
  ) {
    return undefined;
  }

  const addresses = new BlockList();
  addresses.addSubnet(address, prefix, family);

  return { addresses, family };
}

/**
 * The comparison `IpAddress` and `NotIpAddress` are built from.
 *
 * An IPv4 address never falls inside an IPv6 range, nor the reverse. Node.js
 * would match an IPv4 address inside `::/0` through its IPv4-mapped form, so
 * the families are compared first.
 */
export const simIamIpAddressComparison: SimIamValueComparison = (
  actual,
  expected,
) => {
  if (typeof actual !== "string" || typeof expected !== "string") {
    return;
  }

  const family = familyOf(actual);
  const range = rangeOf(expected);

  if (family === undefined || range === undefined) {
    return;
  }

  return range.family === family && range.addresses.check(actual, family);
};
