import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { simLogsArnPrefix } from "../group/sim-logs-arn.js";

/**
 * The ARN of a delivery source.
 *
 * A delivery source is named by the caller, so its ARN carries that name. The
 * delivery itself is the only one of the three resources named by an
 * identifier CloudWatch Logs issues.
 */
export function simLogsDeliverySourceArn(
  scope: SimAwsAccountRegionScope,
  name: string,
): string {
  return `${simLogsArnPrefix(scope)}delivery-source:${name}`;
}

/**
 * The ARN of every delivery source in one account and region.
 */
export function simLogsAnyDeliverySourceArn(
  scope: SimAwsAccountRegionScope,
): string {
  return simLogsDeliverySourceArn(scope, "*");
}

/**
 * The ARN of a delivery destination.
 */
export function simLogsDeliveryDestinationArn(
  scope: SimAwsAccountRegionScope,
  name: string,
): string {
  return `${simLogsArnPrefix(scope)}delivery-destination:${name}`;
}

/**
 * The ARN of every delivery destination in one account and region.
 */
export function simLogsAnyDeliveryDestinationArn(
  scope: SimAwsAccountRegionScope,
): string {
  return simLogsDeliveryDestinationArn(scope, "*");
}

/**
 * The ARN of a delivery.
 */
export function simLogsDeliveryArn(
  scope: SimAwsAccountRegionScope,
  deliveryId: string,
): string {
  return `${simLogsArnPrefix(scope)}delivery:${deliveryId}`;
}

/**
 * The ARN of every delivery in one account and region.
 */
export function simLogsAnyDeliveryArn(scope: SimAwsAccountRegionScope): string {
  return simLogsDeliveryArn(scope, "*");
}
