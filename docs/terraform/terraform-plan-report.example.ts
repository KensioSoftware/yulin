/**
 * Reading what a Terraform plan import made of the plan.
 */

import { SimAws } from "@kensio/yulin";
import { TerraformAdapter } from "@kensio/yulin/terraform";

const simAws = new SimAws();

const { report } = await new TerraformAdapter(simAws).deployPlan(
  "terraform/orders.tfplan.json",
);

// [ { address: 'aws_s3_bucket.uploads', type: 'aws_s3_bucket',
//     cfnType: 'AWS::S3::Bucket', logicalId: 'AwsS3BucketUploads' } ]
console.log(report.mapped);

// [ { address: 'aws_route53_zone.public', type: 'aws_route53_zone',
//     reason: 'no mapping for resource type' } ]
console.log(report.skipped);

// The aws_s3_bucket_versioning and friends that became bucket properties.
console.log(report.folded);

// Attributes a mapping could not carry and no override supplied, such as a
// Lambda's environment variables, which Terraform collapses whole when one of
// them is unknown.
console.log(report.lost);
