import { SimLogsInvalidParameterException } from "../../error/sim-logs.error.js";
import type { SimLogsSubscriptionFilter } from "../../subscription/sim-logs-subscription-filter.js";
import type { SimLogsSubscriptionFilterDetail } from "./subscription.command.js";

/**
 * What DescribeSubscriptionFilters reports about one filter.
 */
export function simLogsFilterDetail(
  filter: SimLogsSubscriptionFilter,
): SimLogsSubscriptionFilterDetail {
  return {
    filterName: filter.filterName,
    logGroupName: filter.logGroupName,
    filterPattern: filter.filterPatternText,
    destinationArn: filter.destinationArn,
    roleArn: filter.roleArn,
    distribution: filter.distribution,
    creationTime: filter.creationTime,
  };
}

/**
 * Read the name a subscription filter is identified by on its log group.
 */
export function requiredSimLogsFilterName(filterName?: string): string {
  if (filterName === undefined || filterName.length === 0) {
    throw new SimLogsInvalidParameterException(
      "1 validation error detected: Value at 'filterName' failed to satisfy " +
        "constraint: Member must not be null",
    );
  }

  return filterName;
}

/**
 * Read the destination a subscription filter delivers to.
 */
export function requiredSimLogsDestinationArn(destinationArn?: string): string {
  if (destinationArn === undefined || destinationArn.length === 0) {
    throw new SimLogsInvalidParameterException(
      "1 validation error detected: Value at 'destinationArn' failed to " +
        "satisfy constraint: Member must not be null",
    );
  }

  return destinationArn;
}
