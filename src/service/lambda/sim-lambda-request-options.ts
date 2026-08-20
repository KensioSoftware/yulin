import type { SimAwsCaller } from "../aws/caller/sim-aws-caller.js";

/**
 * What a request to simulated Lambda carries beyond the command itself.
 */
export interface SimLambdaRequestOptions {
  readonly caller?: SimAwsCaller;
}
