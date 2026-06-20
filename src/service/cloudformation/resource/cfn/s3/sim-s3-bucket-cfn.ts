import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimS3Bucket } from "../../../../s3/bucket/sim-s3-bucket.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimS3BucketCfnProps {
  readonly logicalId: string;
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
  constructor(private readonly props: SimS3BucketCfnProps) {}

  /**
   * CloudFormation Ref for AWS::S3::Bucket returns the bucket name.
   */
  refValue(): SimCfnTemplateValue {
    return this.props.bucket.bucketName;
  }

  /**
   * CloudFormation attributes for AWS::S3::Bucket.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "WebsiteURL") {
      return this.props.bucket.getWebsiteUrl().toString();
    }

    return `${this.props.bucket.bucketName}.${attributeName}`;
  }
}
