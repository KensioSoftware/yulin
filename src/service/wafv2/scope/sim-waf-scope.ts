import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import { SimWafInvalidParameterException } from "../error/sim-wafv2.error.js";

/**
 * Which fronting layer a WAFv2 resource is for.
 *
 * The two are separate namespaces rather than a label: a name is unique within
 * one of them, and a `REGIONAL` web ACL cannot be put in front of a CloudFront
 * distribution however it is named.
 */
export type SimWafScope = "CLOUDFRONT" | "REGIONAL";

/**
 * The Region every `CLOUDFRONT` scope resource lives in.
 *
 * CloudFront is global and its WAFv2 resources are held in `us-east-1`, so a
 * client anywhere else has nothing to create them through.
 */
export const simWafCloudFrontRegion: AwsRegionName = "us-east-1";

/**
 * The part of an ARN that says which scope a resource belongs to.
 */
export function simWafScopePath(scope: SimWafScope): string {
  return scope === "CLOUDFRONT" ? "global" : "regional";
}

/**
 * Read the scope a request named, refusing anything else.
 *
 * A `CLOUDFRONT` scope request outside `us-east-1` is refused rather than
 * quietly served, because a web ACL created that way would be invisible to the
 * distribution it was written for.
 */
export function requiredSimWafScope(
  scope: string | undefined,
  regionName: AwsRegionName,
): SimWafScope {
  if (scope !== "CLOUDFRONT" && scope !== "REGIONAL") {
    throw new SimWafInvalidParameterException(
      `Error reason: The scope is not valid., field: SCOPE_VALUE, ` +
        `parameter: ${String(scope)}`,
    );
  }

  if (scope === "CLOUDFRONT" && regionName !== simWafCloudFrontRegion) {
    throw new SimWafInvalidParameterException(
      `Error reason: The scope CLOUDFRONT is only available in ` +
        `${simWafCloudFrontRegion}, and this request was made in ` +
        `${regionName}., field: SCOPE_VALUE, parameter: CLOUDFRONT`,
    );
  }

  return scope;
}
