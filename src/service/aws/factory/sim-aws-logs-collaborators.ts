import { SimAwsLogsDeliveryDistributions } from "../../logs/delivery/cloudfront/sim-aws-logs-delivery-distributions.js";
import type { SimLogsDeliverySourceResources } from "../../logs/delivery/sim-logs-delivery-source-resources.js";
import { SimAwsLogsSubscriptionFunctions } from "../../logs/subscription/lambda/sim-aws-logs-subscription-functions.js";
import type { SimLogsSubscriptionDestinations } from "../../logs/subscription/sim-logs-subscription-destinations.js";
import type { SimAwsAccountRegionScope } from "../sim-aws-account-region-scope.js";
import type { SimAws } from "../sim-aws.js";

/**
 * What simulated CloudWatch Logs reaches for in the rest of the simulation.
 */
interface SimAwsLogsCollaborators {
  readonly subscriptionDestinations: SimLogsSubscriptionDestinations;
  readonly deliverySourceResources: SimLogsDeliverySourceResources;
}

/**
 * Build the collaborators simulated CloudWatch Logs takes beyond the scoped
 * ones every service gets.
 *
 * A subscription filter delivers to a simulated Lambda function, which real
 * CloudWatch Logs requires to be in the same Account as the filter, so the
 * scope is passed in for the destination to be checked against. The function
 * is looked up when an event is delivered rather than now: every Lambda
 * function records its output in simulated CloudWatch Logs, so reaching one
 * while this is being built would be a cycle with no bottom.
 *
 * A delivery source names the resource its logs come from by ARN. CloudFront
 * is the one delivered service whose resources are resolved, and its resolver
 * takes the same scope to read the account segment of that ARN against.
 */
export function simAwsLogsCollaborators(
  simAws: SimAws,
  accountRegionScope: SimAwsAccountRegionScope,
): SimAwsLogsCollaborators {
  return {
    subscriptionDestinations: new SimAwsLogsSubscriptionFunctions({
      simAws,
      accountRegionScope,
    }),
    deliverySourceResources: new SimAwsLogsDeliveryDistributions({
      simAws,
      accountRegionScope,
    }),
  };
}
