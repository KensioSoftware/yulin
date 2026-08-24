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
 * The one kind of log CloudFront delivers.
 *
 * Standard logging v2 carries access logs and nothing else, so an account
 * refuses a source over a distribution asking for anything else.
 */
export const simLogsCloudFrontLogType = "ACCESS_LOGS";

/** How many colon separated segments the shortest ARN has. */
const arnSegmentCount = 6;

/**
 * The AWS service a delivery source's resource belongs to.
 *
 * Real CloudWatch Logs works this out from the ARN and reports it as the
 * source's `service`, so a caller never states it. The whole ARN is checked
 * rather than the service segment alone. `arn:aws:cloudfront` names a service
 * and no resource, and a source over it would deliver nothing and say nothing
 * about why.
 */
export function requiredSimLogsDeliveredService(resourceArn: string): string {
  const segments = resourceArn.split(":");
  const [prefix, , service] = segments;
  const named = segments
    .slice(arnSegmentCount - 1)
    .some((segment) => segment !== "");

  if (
    service === undefined ||
    service === "" ||
    !named ||
    prefix !== "arn" ||
    segments.length < arnSegmentCount
  ) {
    throw new SimLogsValidationException(
      `resourceArn '${resourceArn}' is not the ARN of a resource, so the ` +
        `service the delivery source is for cannot be read from it`,
    );
  }

  return service;
}

interface SimLogsDeliverySourceRules {
  readonly service: string;
  readonly regionName: AwsRegionName;
  readonly logType: string;
}

/**
 * Refuse a delivery source an account would refuse.
 *
 * Only the CloudFront rules are modelled. CloudFront is the one service whose
 * delivery is pinned to a region other than its own resource's, and the log
 * types the other services take vary by service in a way this simulation does
 * not carry.
 */
export function requireSimLogsDeliverySource(
  properties: SimLogsDeliverySourceRules,
): void {
  const { service, regionName, logType } = properties;

  if (service !== simLogsCloudFrontDeliveryService) {
    return;
  }

  if (regionName !== simLogsCloudFrontDeliveryRegion) {
    throw new SimLogsValidationException(
      `A CloudFront delivery source can only be created in ${simLogsCloudFrontDeliveryRegion}, and this request was made in ${regionName}`,
    );
  }

  if (logType !== simLogsCloudFrontLogType) {
    throw new SimLogsValidationException(
      `logType '${logType}' is not one CloudFront delivers. ` +
        `${simLogsCloudFrontLogType} is the only one it has`,
    );
  }
}
