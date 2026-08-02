import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";

/**
 * Per-request options for a simulated API Gateway v2 command.
 */
export interface SimApiGatewayV2RequestOptions {
  readonly caller?: SimAwsCaller;
}
