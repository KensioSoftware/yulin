import { SimCloudFrontDistribution } from "../../../../cloudfront/distribution/sim-cloudfront-distribution.js";
import { SimCloudFrontDistributionCfn } from "./sim-cloudfront-distribution-cfn.js";
import { SimCloudFrontFunction } from "../../../../cloudfront/cff/sim-cloudfront-function.js";
import { SimCloudFrontFunctionCfn } from "./sim-cloudfront-function-cfn.js";
import { SimCloudFrontResponseHeadersPolicy } from "../../../../cloudfront/response-headers-policy/sim-cf-response-headers-policy.js";
import { SimCloudFrontResponseHeadersPolicyCfn } from "./sim-cloudfront-rh-policy-cfn.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";

/**
 * The CloudFormation-facing value adapter for a simulated CloudFront Resource.
 */
export function cloudFrontValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  if (
    properties.type === "AWS::CloudFront::Distribution" &&
    properties.simResource instanceof SimCloudFrontDistribution
  ) {
    return new SimCloudFrontDistributionCfn({ distro: properties.simResource });
  }

  if (
    properties.type === "AWS::CloudFront::Function" &&
    properties.simResource instanceof SimCloudFrontFunction
  ) {
    return new SimCloudFrontFunctionCfn({
      cloudFrontFunction: properties.simResource,
    });
  }

  if (
    properties.type === "AWS::CloudFront::ResponseHeadersPolicy" &&
    properties.simResource instanceof SimCloudFrontResponseHeadersPolicy
  ) {
    return new SimCloudFrontResponseHeadersPolicyCfn({
      policy: properties.simResource,
    });
  }

  return undefined;
}
