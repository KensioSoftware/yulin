import {
  SimElbV2UnsimulatedInputException,
  SimElbV2ValidationError,
} from "./error/sim-elbv2.error.js";

/**
 * The protocols an Application Load Balancer speaks.
 *
 * `TCP`, `TLS`, `UDP` and `TCP_UDP` belong to a Network Load Balancer, and
 * `GENEVE` to a Gateway Load Balancer. Neither is simulated, so a protocol
 * naming one is refused rather than accepted onto an application load
 * balancer that could never speak it.
 */
const appProtocols = new Set(["HTTP", "HTTPS"]);

/**
 * Read a protocol a request names, refusing one an ALB does not speak.
 */
export function simElbV2Protocol(field: string, value: string): string {
  if (!appProtocols.has(value)) {
    throw new SimElbV2UnsimulatedInputException(
      `${field} '${value}' is not simulated. An Application Load Balancer ` +
        `speaks ${[...appProtocols].join(" and ")}, and network and ` +
        `gateway load balancers are out of scope here.`,
    );
  }

  return value;
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
