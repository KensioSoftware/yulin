import { isIPv4, isIPv6 } from "node:net";

import { SimWafInvalidParameterException } from "../error/sim-wafv2.error.js";
import {
  SimWafResource,
  type SimWafResourceProperties,
} from "../resource/sim-waf-resource.js";

/**
 * Which kind of address an IP set holds. A set holds one or the other, never
 * both, as it does on AWS.
 */
export type SimWafIpAddressVersion = "IPV4" | "IPV6";

interface SimWafIpSetProperties extends SimWafResourceProperties {
  readonly ipAddressVersion: SimWafIpAddressVersion;
  readonly addresses: readonly string[];
}

/**
 * One named list of address ranges.
 *
 * Nothing evaluates an IP set here, because `IPSetReferenceStatement` is
 * refused: every request in this simulation comes from 127.0.0.1, so a rule on
 * the client address would see one client for the whole simulation. The
 * resource is still held, so a stack that creates one deploys and a test can
 * read back what it created.
 */
export class SimWafIpSet extends SimWafResource {
  public readonly ipAddressVersion: SimWafIpAddressVersion;
  public readonly addresses: readonly string[];

  constructor(properties: SimWafIpSetProperties) {
    super("ipset", properties);

    this.ipAddressVersion = properties.ipAddressVersion;
    this.addresses = properties.addresses.map((address) =>
      checkedAddress(address, properties.ipAddressVersion),
    );
  }
}

/**
 * Read the address version a request named, refusing anything else.
 */
export function requiredSimWafIpAddressVersion(
  version: string | undefined,
): SimWafIpAddressVersion {
  if (version !== "IPV4" && version !== "IPV6") {
    throw new SimWafInvalidParameterException(
      `Error reason: The IP address version is not valid, field: ` +
        `IP_ADDRESS_VERSION, parameter: ${String(version)}`,
    );
  }

  return version;
}

/**
 * Check one address is written the way WAF wants it.
 *
 * WAF takes CIDR notation and nothing else, so a bare address is refused here
 * as it is on AWS: `192.0.2.44` has to be written `192.0.2.44/32`, and that is
 * a mistake worth meeting in a test rather than in a deployment.
 */
function checkedAddress(
  address: string,
  version: SimWafIpAddressVersion,
): string {
  const isAddress = version === "IPV4" ? isIPv4 : isIPv6;
  const longestPrefix = version === "IPV4" ? 32 : 128;
  const separator = address.lastIndexOf("/");
  const prefixLength = Number(address.slice(separator + 1));

  if (
    separator === -1 ||
    !isAddress(address.slice(0, separator)) ||
    !Number.isSafeInteger(prefixLength) ||
    prefixLength < 0 ||
    prefixLength > longestPrefix
  ) {
    throw new SimWafInvalidParameterException(
      `Error reason: The IP address ${address} is not valid ${version} CIDR ` +
        `notation, field: IP_ADDRESS, parameter: ${address}`,
    );
  }

  return address;
}
