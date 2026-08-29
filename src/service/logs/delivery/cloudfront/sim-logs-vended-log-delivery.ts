import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimLogsAuthorizer } from "../../command/authorize/sim-logs-authorizer.js";
import { simLogsCloudFrontDeliveryService } from "../sim-logs-delivery-source-service.js";

/**
 * The CloudFront action a delivery source over a distribution is checked for.
 *
 * CloudFront names it and nobody calls it. It exists so that setting up
 * delivery from a distribution is a permission of its own, held apart from
 * everything else a caller may do to that distribution.
 */
const simLogsVendedLogDeliveryAction =
  "cloudfront:AllowVendedLogDeliveryForResource";

interface SimLogsVendedLogDeliveryAuthorization {
  readonly authorizer: SimLogsAuthorizer;
  readonly service: string;
  readonly resourceArn: string;
  readonly caller?: SimAwsCaller | undefined;
}

/**
 * Authorize delivering the logs of the resource a delivery source names.
 *
 * Creating a delivery source calls CloudWatch Logs, and CloudWatch Logs then
 * checks the caller against the service that owns the resource being logged.
 * A policy is usually written by asking which service owns the resource type,
 * and that question gives the wrong answer here. A caller allowed every
 * `logs:` action and denied CloudFront outright is refused.
 *
 * CloudFront is the one delivered service checked, because it is the one the
 * simulation can name a resource of. A source over an ARN of any other service
 * carries on as it always did.
 */
export function authorizeSimLogsVendedLogDelivery(
  properties: SimLogsVendedLogDeliveryAuthorization,
): void {
  if (properties.service !== simLogsCloudFrontDeliveryService) {
    return;
  }

  properties.authorizer.authorizeResource(
    simLogsVendedLogDeliveryAction,
    properties.resourceArn,
    properties.caller,
  );
}
