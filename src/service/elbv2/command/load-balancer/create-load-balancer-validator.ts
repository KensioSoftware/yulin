import {
  SimElbV2UnsimulatedInputException,
  SimElbV2ValidationError,
} from "../../error/sim-elbv2.error.js";
import type { SimCreateLoadBalancerCommandInput } from "./load-balancer.command.js";

/**
 * The addressing real ELB takes on an application load balancer.
 */
const simulatedIpAddressTypes = new Set(["ipv4", "dualstack"]);

/**
 * Refuse a load balancer this simulation does not have.
 *
 * Only the application type is simulated. A network or gateway load balancer
 * routes at a layer nothing here speaks, so creating one and reporting it as
 * an application load balancer would be worse than refusing it.
 *
 * These checks run before background sequencing and IAM authorization, so a
 * malformed request stays a client error rather than producing an
 * authorization result, as it does on real ELB.
 */
export function validateSimElbV2LoadBalancerRequest(
  input: SimCreateLoadBalancerCommandInput,
): void {
  if (input.Type !== undefined && input.Type !== "application") {
    throw new SimElbV2UnsimulatedInputException(
      `Type '${input.Type}' is not simulated. Only the application load ` +
        `balancer is, so a network or gateway load balancer is refused ` +
        `rather than created as an application one.`,
    );
  }

  if (
    input.IpAddressType !== undefined &&
    !simulatedIpAddressTypes.has(input.IpAddressType)
  ) {
    throw new SimElbV2ValidationError(
      `IpAddressType '${input.IpAddressType}' is not valid. An address type ` +
        `is ${[...simulatedIpAddressTypes].join(" or ")}.`,
    );
  }
}
