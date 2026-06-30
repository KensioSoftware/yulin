import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimS3Bucket } from "../../../../s3/bucket/sim-s3-bucket.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimS3BucketCfnProps {
  readonly bucket: SimS3Bucket;
}

/**
 * CloudFormation-facing behavior for an AWS::S3::Bucket Resource.
 *
 * This keeps S3 service objects free of CloudFormation intrinsic-function
 * concerns while still allowing CloudFormation to expose type-specific Ref and
 * Fn::GetAtt values.
 */
export class SimS3BucketCfn implements SimCfnResourceValueAdapter {
  private readonly bucket: SimS3Bucket;

  constructor(props: SimS3BucketCfnProps) {
    this.bucket = props.bucket;
  }

  /**
   * CloudFormation Ref for AWS::S3::Bucket returns the bucket name.
   */
  refValue(): SimCfnTemplateValue {
    return this.bucket.bucketName;
  }

  /**
   * CloudFormation attributes for AWS::S3::Bucket.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "Arn") {
      return `arn:aws:s3:::${this.bucket.bucketName}`;
    }

    if (attributeName === "DomainName") {
      return `${this.bucket.bucketName}.s3.amazonaws.com`;
    }

    if (attributeName === "RegionalDomainName") {
      return `${this.bucket.bucketName}.s3.${this.bucket.getAccountRegionScope().regionName}.amazonaws.com`;
    }

    if (attributeName === "WebsiteURL") {
      return this.bucket.getWebsiteUrl().toString();
    }

    return `${this.bucket.bucketName}.${attributeName}`;
  }
}
