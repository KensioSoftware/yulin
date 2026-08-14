import {
  SimElbV2UnsimulatedInputException,
  SimElbV2ValidationError,
} from "./error/sim-elbv2.error.js";

/**
 * The protocols an Application Load Balancer speaks.
 */
const appProtocols = new Set(["HTTP", "HTTPS"]);

/**
 * The protocols real ELB takes that no application load balancer speaks.
 *
 * `TCP`, `TLS`, `UDP` and `TCP_UDP` belong to a Network Load Balancer and
 * `GENEVE` to a Gateway Load Balancer. Neither is simulated, so one of these
 * is refused as input this simulation does not go far enough for, which is a
 * different thing from a value that is not an ELB protocol at all.
 */
const otherLoadBalancerProtocols = new Set([
  "TCP",
  "TLS",
  "UDP",
  "TCP_UDP",
  "GENEVE",
]);

/**
 * Read a protocol a request names, refusing one an ALB does not speak.
 */
export function simElbV2Protocol(field: string, value: string): string {
  if (appProtocols.has(value)) {
    return value;
  }

  if (otherLoadBalancerProtocols.has(value)) {
    throw new SimElbV2UnsimulatedInputException(
      `${field} '${value}' is a network or gateway load balancer protocol, ` +
        `and neither is simulated. An Application Load Balancer speaks ` +
        `${[...appProtocols].join(" and ")}.`,
    );
  }

  throw new SimElbV2ValidationError(
    `${field} '${value}' is not a valid ELB protocol`,
  );
}

/**
 * Read a port a request names, refusing one outside the range ELB takes.
 */
export function simElbV2Port(field: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_535) {
    throw new SimElbV2ValidationError(
      `${field} ${String(value)} is not a port between 1 and 65535`,
    );
  }

  return value;
}
