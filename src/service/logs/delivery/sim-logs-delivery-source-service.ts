import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import { SimLogsValidationException } from "../error/sim-logs.error.js";

/**
 * The service name a CloudFront delivery source reports.
 */
export const simLogsCloudFrontDeliveryService = "cloudfront";

/**
 * The one region CloudFront delivery is set up from.
 *
 * CloudFront is global and its standard logging v2 delivery lives in
 * `us-east-1`, whatever region the bucket the logs land in belongs to. A
 * caller anywhere else has nothing to create the delivery source through, and
 * the mistake is easy to make because the rest of the stack is usually
 * somewhere else.
 */
export const simLogsCloudFrontDeliveryRegion: AwsRegionName = "us-east-1";

/**
 * The AWS service a delivery source's resource belongs to.
 *
 * Real CloudWatch Logs works this out from the ARN and reports it as the
 * source's `service`, so a caller never states it. A malformed ARN is refused
 * here, because a source whose service could not be read would deliver
 * nothing and say nothing about why.
 */
export function requiredSimLogsDeliveredService(resourceArn: string): string {
  const [prefix, , service] = resourceArn.split(":", 3);

  if (service === undefined || service === "" || prefix !== "arn") {
    throw new SimLogsValidationException(
      `resourceArn '${resourceArn}' is not an ARN, so the service the ` +
        `delivery source is for cannot be read from it`,
    );
  }

  return service;
}

/**
 * Refuse a delivery source for a service the request's region cannot reach.
 *
 * Only the CloudFront rule is modelled, because CloudFront is the one service
 * whose delivery is pinned to a region other than its resource's own.
 */
export function requireSimLogsDeliveryRegion(
  service: string,
  regionName: AwsRegionName,
): void {
  if (
    service === simLogsCloudFrontDeliveryService &&
    regionName !== simLogsCloudFrontDeliveryRegion
  ) {
    throw new SimLogsValidationException(
      `A CloudFront delivery source can only be created in ${simLogsCloudFrontDeliveryRegion}, and this request was made in ${regionName}`,
    );
  }
}
