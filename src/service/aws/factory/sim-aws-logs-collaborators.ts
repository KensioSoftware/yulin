import { SimAwsLogsSubscriptionFunctions } from "../../logs/subscription/lambda/sim-aws-logs-subscription-functions.js";
import type { SimLogsSubscriptionDestinations } from "../../logs/subscription/sim-logs-subscription-destinations.js";
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
 * A subscription filter delivers to a simulated Lambda function resolved in
 * the whole simulation rather than in one scope, because a destination ARN
 * names the Account and Region its function is in, which need not be the log
 * group's. The function is looked up when an event is delivered rather than
 * now: every Lambda function records its output in simulated CloudWatch Logs,
 * so reaching one while this is being built would be a cycle with no bottom.
 */
export function simAwsLogsCollaborators(
  simAws: SimAws,
): SimAwsLogsCollaborators {
  return {
    subscriptionDestinations: new SimAwsLogsSubscriptionFunctions({ simAws }),
  };
}
