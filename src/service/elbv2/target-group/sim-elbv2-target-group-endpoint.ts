import { simElbV2Port, simElbV2Protocol } from "../sim-elbv2-protocol.js";

/**
 * Where a target group's targets are reached, as a request states it.
 */
export interface SimElbV2TargetGroupEndpoint {
  readonly protocol: string | undefined;
  readonly port: number | undefined;
}

/**
 * The endpoint properties a request can state.
 */
export interface SimElbV2TargetGroupEndpointInput {
  readonly Protocol?: string | undefined;
  readonly Port?: number | undefined;
}

/**
 * Read the protocol and port a target group request names, if it names them.
 *
 * Both are optional here rather than required, because whether they belong on
 * a group at all is the target type's decision: an address group needs them
 * and a function group refuses them. What this owns is only that a value that
 * is there is one real ELB would take.
 */
export function simElbV2TargetGroupEndpoint(
  input: SimElbV2TargetGroupEndpointInput,
): SimElbV2TargetGroupEndpoint {
  return {
    protocol:
      input.Protocol === undefined
        ? undefined
        : simElbV2Protocol("Protocol", input.Protocol),
    port:
      input.Port === undefined ? undefined : simElbV2Port("Port", input.Port),
  };
}
