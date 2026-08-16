import { SimAwsLogsSubscriptionFunctions } from "../../logs/subscription/lambda/sim-aws-logs-subscription-functions.js";
import type { SimLogsSubscriptionDestinations } from "../../logs/subscription/sim-logs-subscription-destinations.js";
import type { SimAwsAccountRegionScope } from "../sim-aws-account-region-scope.js";
import type { SimAws } from "../sim-aws.js";

/**
 * What simulated CloudWatch Logs reaches for in the rest of the simulation.
 */
interface SimAwsLogsCollaborators {
  readonly subscriptionDestinations: SimLogsSubscriptionDestinations;
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
  };
}
