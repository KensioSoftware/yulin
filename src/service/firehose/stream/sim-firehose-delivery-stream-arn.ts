import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";

/**
 * The ARN of a delivery stream of a given name in an Account and Region.
 *
 * Every Firehose operation names its delivery stream by name, so nothing here
 * reads an ARN back. This builds the resource an action authorizes against, and
 * the ARN CreateDeliveryStream answers with.
 */
export function simFirehoseDeliveryStreamArn(
  accountRegionScope: SimAwsAccountRegionScope,
  name: string,
): string {
  const { regionName, accountId } = accountRegionScope;

  return `arn:aws:firehose:${regionName}:${accountId}:deliverystream/${name}`;
}
