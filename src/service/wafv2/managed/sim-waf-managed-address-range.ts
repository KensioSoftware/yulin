import { BlockList, isIP } from "node:net";

import { SimWafDeclarationError } from "../error/sim-wafv2.error.js";

/**
 * One address or range of addresses, and the rules that flag a request from
 * inside it.
 */
export class SimWafDeclaredAddressRange {
  public readonly matches: ReadonlySet<string>;

  readonly #addresses = new BlockList();

  private constructor(range: CheckedRange, matches: ReadonlySet<string>) {
    this.matches = matches;

    if (range.prefix === undefined) {
      this.#addresses.addAddress(range.address, range.family);
    } else {
      this.#addresses.addSubnet(range.address, range.prefix, range.family);
    }
  }

  /**
   * Read one range a test declared, refusing what is not an address or a CIDR
   * range.
   */
  static read(
    range: string,
    matches: ReadonlySet<string>,
  ): SimWafDeclaredAddressRange {
    return new SimWafDeclaredAddressRange(checkedRange(range), matches);
  }

  /**
   * Whether one client address falls inside this range.
   *
   * An IPv4 address is never inside an IPv6 range, nor the reverse, which is
   * how an AWS IP set holding one kind treats the other.
   */
  holds(sourceIp: string): boolean {
    const family = familyOf(sourceIp);

    return family !== undefined && this.#addresses.check(sourceIp, family);
  }
}

type AddressFamily = "ipv4" | "ipv6";

interface CheckedRange {
  readonly address: string;
  readonly prefix: number | undefined;
  readonly family: AddressFamily;
}

/**
 * Read an address or a CIDR range into the address, the prefix length and the
 * family.
 */
function checkedRange(range: string): CheckedRange {
  const [address = "", prefixText, ...rest] = range.trim().split("/");
  const family = familyOf(address);

  if (family === undefined || rest.length > 0) {
    throw invalidRange(range);
  }

  if (prefixText === undefined) {
    return { address, prefix: undefined, family };
  }

  const prefix = Number(prefixText);
  const widest = family === "ipv4" ? 32 : 128;

  if (!/^\d+$/u.test(prefixText) || prefix > widest) {
    throw invalidRange(range);
  }

  return { address, prefix, family };
}

function familyOf(address: string): AddressFamily | undefined {
  switch (isIP(address)) {
    case 4: {
      return "ipv4";
    }
    case 6: {
      return "ipv6";
    }
    default: {
      return undefined;
    }
  }
}

function invalidRange(range: string): SimWafDeclarationError {
  return new SimWafDeclarationError(
    `A declared address match needs one IPv4 or IPv6 address, or a CIDR ` +
      `range such as 185.220.101.0/24, and ${range} is neither`,
  );
}
