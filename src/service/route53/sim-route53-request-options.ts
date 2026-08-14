import type { SimAwsCaller } from "../aws/caller/sim-aws-caller.js";

/**
 * The options every simulated Route53 command takes.
 */
export interface SimRoute53RequestOptions {
  readonly caller?: SimAwsCaller;
}
