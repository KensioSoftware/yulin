import type { SimAwsServiceName } from "../../service/aws/sim-aws-services.js";
import type { AwsRegionName } from "../../service/aws/sim-aws-region.js";
import type { SimAws } from "../../service/aws/sim-aws.js";

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
 * Controller for a simulated AWS service exposed through HTTP.
 */
export interface SimAwsServiceController {
  /**
   * Handle an HTTP request routed to this simulated AWS service.
   */
  handleRequest(
    target: SimAwsServiceTarget,
    request: Request,
  ): Promise<Response>;
}
