import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";

/**
 * Per-request options for a simulated API Gateway REST API command.
 */
export interface SimApiGatewayRequestOptions {
  readonly caller?: SimAwsCaller;
}
