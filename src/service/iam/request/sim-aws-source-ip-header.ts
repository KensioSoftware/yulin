import { isIP } from "node:net";

import { simAwsProxiedSourceIp } from "../../../serve/http/sim-aws-proxied-connection.js";
import { SimAwsInvalidCallerHeader } from "./error/sim-aws-request-auth.error.js";

/**
 * The header naming the client address a request into simulated AWS comes
 * from.
 *
 * A request arrives in process or over loopback, so there is no remote address
 * for the simulation to read. Whatever decides by where a request came from,
 * such as a web ACL's IP reputation and anonymous IP rules, reads this instead,
 * and a test sends it to say which client a request stands for.
 */
export const simAwsSourceIpHeaderName = "x-sim-aws-source-ip";

/**
 * Read the client address a request states, or the loopback address when it
 * states none.
 *
 * The header holds one IPv4 or IPv6 address. A value that is neither is
 * refused rather than read as loopback, since a test that misspelt an address
 * would otherwise pass for the wrong reason.
 */
export function simAwsRequestSourceIp(headers: Headers): string {
  const value = headers.get(simAwsSourceIpHeaderName)?.trim();

  if (value === undefined || value === "") {
    return simAwsProxiedSourceIp;
  }

  if (isIP(value) === 0) {
    throw new SimAwsInvalidCallerHeader(
      `${simAwsSourceIpHeaderName} value ${value} must be one IPv4 or IPv6 ` +
        `address`,
    );
  }

  return value;
}
