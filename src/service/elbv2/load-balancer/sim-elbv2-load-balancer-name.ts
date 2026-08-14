import { SimElbV2ValidationError } from "../error/sim-elbv2.error.js";
import { readSimElbV2Name } from "../sim-elbv2-resource-name.js";

/**
 * The prefix real ELB reserves for the DNS name of an internal load balancer.
 *
 * A load balancer named with it could not be told apart from an internal one
 * by host name alone, which is why real ELB refuses the name.
 */
const reservedPrefix = "internal-";

/**
 * Read the name of a load balancer a request names.
 */
export function simElbV2LoadBalancerName(value: string | undefined): string {
  const name = readSimElbV2Name("LoadBalancerName", value ?? "");

  if (name.startsWith(reservedPrefix)) {
    throw new SimElbV2ValidationError(
      `LoadBalancerName '${name}' cannot begin with '${reservedPrefix}', ` +
        `which real ELB reserves for the DNS name of an internal load balancer`,
    );
  }

  return name;
}
