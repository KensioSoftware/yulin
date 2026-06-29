import type { SimCfnTemplateValue } from "../../template/value/sim-cfn-template-value.js";
import { SimS3Bucket } from "../../../s3/bucket/sim-s3-bucket.js";
import { SimS3BucketCfn } from "./s3/sim-s3-bucket-cfn.js";
import { SimCfnDefaultResourceValueAdapter } from "./sim-cfn-default-resource-value-adapter.js";
import { SimCloudFrontDistribution } from "../../../cloudfront/distribution/sim-cloudfront-distribution.js";
import { SimCloudFrontDistributionCfn } from "./cloudfront/sim-cloudfront-distribution-cfn.js";
import { SimCloudFrontFunction } from "../../../cloudfront/cff/sim-cloudfront-function.js";
import { SimCloudFrontFunctionCfn } from "./cloudfront/sim-cloudfront-function-cfn.js";
import { SimRoute53HostedZone } from "../../../route53/hosted-zone/sim-route53-hosted-zone.js";
import { SimRoute53HostedZoneCfn } from "./route53/sim-route53-hosted-zone-cfn.js";

export interface SimCfnResourceValueAdapter {
  refValue(): SimCfnTemplateValue;

  attributeValue(attributeName: string): SimCfnTemplateValue;
}

interface SimCfnResourceValueAdapterProps {
  readonly logicalId: string;
  readonly type: string | undefined;
  readonly simResource: object | undefined;
}

/**
 * Build the CloudFormation-facing value adapter for a created simulated
 * Resource.
 *
 * The underlying simulated AWS service object stays service-focused; this
 * adapter owns CloudFormation-specific Ref and Fn::GetAtt behavior.
 */
export function simCfnResourceValueAdapter(
  props: SimCfnResourceValueAdapterProps,
): SimCfnResourceValueAdapter {
  if (
    props.type === "AWS::S3::Bucket" &&
    props.simResource instanceof SimS3Bucket
  ) {
    return new SimS3BucketCfn({
      logicalId: props.logicalId,
      bucket: props.simResource,
    });
  }

  if (
    props.type === "AWS::CloudFront::Distribution" &&
    props.simResource instanceof SimCloudFrontDistribution
  ) {
    return new SimCloudFrontDistributionCfn({
      distribution: props.simResource,
    });
  }

  if (
    props.type === "AWS::CloudFront::Function" &&
    props.simResource instanceof SimCloudFrontFunction
  ) {
    return new SimCloudFrontFunctionCfn({
      cloudFrontFunction: props.simResource,
    });
  }

  if (
    props.type === "AWS::Route53::HostedZone" &&
    props.simResource instanceof SimRoute53HostedZone
  ) {
    return new SimRoute53HostedZoneCfn({
      hostedZone: props.simResource,
    });
  }

  return new SimCfnDefaultResourceValueAdapter({
    logicalId: props.logicalId,
  });
}
