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
import { SimAcmCertificateCfn } from "./acm/sim-acm-certificate-cfn.js";
import { SimAcmCertificate } from "../../../acm/certificate/sim-acm-certificate.js";
import { SimIamManagedPolicyCfn } from "./iam/sim-iam-managed-policy-cfn.js";
import type { SimIamManagedPolicy } from "../../../iam/policy/sim-iam-policy.js";
import { SimIamRoleCfn } from "./iam/sim-iam-role-cfn.js";
import type { SimIamRole } from "../../../iam/role/sim-iam-role.js";

export interface SimCfnResourceValueAdapter {
  refValue(): SimCfnTemplateValue;

  attributeValue(attributeName: string): SimCfnTemplateValue;
}

interface SimCfnResourceValueAdapterProperties {
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
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnResourceValueAdapter {
  if (
    properties.type === "AWS::CertificateManager::Certificate" &&
    properties.simResource instanceof SimAcmCertificate
  ) {
    return new SimAcmCertificateCfn({
      certificate: properties.simResource,
    });
  }

  if (
    properties.type === "AWS::S3::Bucket" &&
    properties.simResource instanceof SimS3Bucket
  ) {
    return new SimS3BucketCfn({
      bucket: properties.simResource,
    });
  }

  if (
    properties.type === "AWS::CloudFront::Distribution" &&
    properties.simResource instanceof SimCloudFrontDistribution
  ) {
    return new SimCloudFrontDistributionCfn({
      distro: properties.simResource,
    });
  }

  if (
    properties.type === "AWS::CloudFront::Function" &&
    properties.simResource instanceof SimCloudFrontFunction
  ) {
    return new SimCloudFrontFunctionCfn({
      cloudFrontFunction: properties.simResource,
    });
  }

  if (properties.type === "AWS::IAM::ManagedPolicy") {
    return new SimIamManagedPolicyCfn({
      policy: properties.simResource as SimIamManagedPolicy,
    });
  }

  if (properties.type === "AWS::IAM::Role") {
    return new SimIamRoleCfn({
      role: properties.simResource as SimIamRole,
    });
  }

  if (
    properties.type === "AWS::Route53::HostedZone" &&
    properties.simResource instanceof SimRoute53HostedZone
  ) {
    return new SimRoute53HostedZoneCfn({
      hostedZone: properties.simResource,
    });
  }

  return new SimCfnDefaultResourceValueAdapter({
    logicalId: properties.logicalId,
  });
}
