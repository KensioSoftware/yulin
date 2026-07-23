import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";

/**
 * Options accepted by simulated IAM command operations.
 */
export interface SimIamRequestOptions {
  readonly caller?: SimAwsCaller;
}
