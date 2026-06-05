import type { IncomingMessage, ServerResponse } from "node:http";
import type { SimAws } from "../service/aws/sim-aws.js";
import type { AwsRegionName } from "../service/aws/sim-aws-region.js";
import type { SimAwsServiceName } from "../service/aws/sim-aws-services.js";

export interface SimAwsServiceTarget {
  readonly service: SimAwsServiceName;
  readonly resourceName: string;
  readonly regionName?: AwsRegionName;
}

/**
 * Factory function for making instances of simulated AWS service controllers.
 */
export type SimAwsServiceControllerFactory = (
  simAws: SimAws,
) => SimAwsServiceController;

/**
 * Controller for a simulated AWS service exposed through the localhost server.
 */
export interface SimAwsServiceController {
  /**
   * Handle an HTTP request routed to this simulated AWS service.
   */
  handleRequest(
    target: SimAwsServiceTarget,
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void>;
}
