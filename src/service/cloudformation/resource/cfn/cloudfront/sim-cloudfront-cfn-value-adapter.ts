import { SimCloudFrontDistribution } from "../../../../cloudfront/distribution/sim-cloudfront-distribution.js";
import { SimCloudFrontDistributionCfn } from "./sim-cloudfront-distribution-cfn.js";
import { SimCloudFrontFunction } from "../../../../cloudfront/cff/sim-cloudfront-function.js";
import { SimCloudFrontFunctionCfn } from "./sim-cloudfront-function-cfn.js";
import { SimCloudFrontResponseHeadersPolicy } from "../../../../cloudfront/response-headers-policy/sim-cf-response-headers-policy.js";
import { SimCloudFrontResponseHeadersPolicyCfn } from "./sim-cloudfront-rh-policy-cfn.js";
import { SimCloudFrontCachePolicy } from "../../../../cloudfront/cache-policy/sim-cf-cache-policy.js";
import { SimCloudFrontCachePolicyCfn } from "./sim-cloudfront-cache-policy-cfn.js";
import { SimCloudFrontOriginRequestPolicy } from "../../../../cloudfront/origin-request-policy/sim-cf-origin-request-policy.js";
import { SimCloudFrontOriginRequestPolicyCfn } from "./sim-cloudfront-orp-cfn.js";
import { SimCloudFrontOriginAccessControl } from "../../../../cloudfront/origin-access-control/sim-cf-origin-access-control.js";
import { SimCloudFrontOriginAccessControlCfn } from "./sim-cloudfront-oac-cfn.js";
import { SimCloudFrontKeyValueStore } from "../../../../cloudfront/key-value-store/sim-cf-key-value-store.js";
import { SimCloudFrontKeyValueStoreCfn } from "./sim-cloudfront-kvs-cfn.js";
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

  if (
    properties.type === "AWS::CloudFront::CachePolicy" &&
    properties.simResource instanceof SimCloudFrontCachePolicy
  ) {
    return new SimCloudFrontCachePolicyCfn({
      policy: properties.simResource,
    });
  }

  if (
    properties.type === "AWS::CloudFront::OriginRequestPolicy" &&
    properties.simResource instanceof SimCloudFrontOriginRequestPolicy
  ) {
    return new SimCloudFrontOriginRequestPolicyCfn({
      policy: properties.simResource,
    });
  }

  if (
    properties.type === "AWS::CloudFront::OriginAccessControl" &&
    properties.simResource instanceof SimCloudFrontOriginAccessControl
  ) {
    return new SimCloudFrontOriginAccessControlCfn({
      originAccessControl: properties.simResource,
    });
  }

  if (
    properties.type === "AWS::CloudFront::KeyValueStore" &&
    properties.simResource instanceof SimCloudFrontKeyValueStore
  ) {
    return new SimCloudFrontKeyValueStoreCfn({
      keyValueStore: properties.simResource,
    });
  }

  return undefined;
}
