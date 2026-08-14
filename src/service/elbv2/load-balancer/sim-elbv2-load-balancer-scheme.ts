import { SimElbV2ValidationError } from "../error/sim-elbv2.error.js";

/**
 * Whether a load balancer answers from the internet or only from inside a VPC.
 *
 * The difference is visible here in one place, the DNS name, since an internal
 * load balancer's host name carries an `internal-` prefix. Nothing about
 * reachability follows from it in this simulation, because there is no network
 * boundary to be on either side of.
 */
export type SimElbV2LoadBalancerScheme = "internet-facing" | "internal";

const schemes = new Set<string>(["internet-facing", "internal"]);

/**
 * The scheme real ELB gives a load balancer whose request names none.
 */
const defaultScheme: SimElbV2LoadBalancerScheme = "internet-facing";

/**
 * Read the scheme a request names, defaulting as real ELB does.
 */
export function simElbV2LoadBalancerScheme(
  value: string | undefined,
): SimElbV2LoadBalancerScheme {
  if (value === undefined) {
    return defaultScheme;
  }

  if (!schemes.has(value)) {
    throw new SimElbV2ValidationError(
      `Scheme '${value}' is not valid. A scheme is ` +
        `${[...schemes].join(" or ")}.`,
    );
  }

  return value as SimElbV2LoadBalancerScheme;
}
