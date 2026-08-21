/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import type { SimCfnTemplateValue } from "../template/value/sim-cfn-template-value.js";
import {
  block,
  field,
  renamed,
  type TerraformMappingContext,
} from "./sim-tf-attributes.js";
import { cors } from "./sim-tf-map-s3-cors.js";
import { encryption } from "./sim-tf-map-s3-encryption.js";
import type { TerraformResourceFold } from "./sim-tf-mapping.type.js";

/**
 * The `aws_s3_bucket_*` resources that configure a bucket declared elsewhere.
 *
 * Each names its bucket in a `bucket` attribute and carries one section of
 * what CloudFormation holds on the `AWS::S3::Bucket` itself.
 */
export const s3BucketFolds: ReadonlyMap<string, TerraformResourceFold> =
  new Map([
    [
      "aws_s3_bucket_versioning",
      { parentAttribute: "bucket", properties: versioning },
    ],
    [
      "aws_s3_bucket_public_access_block",
      { parentAttribute: "bucket", properties: publicAccess },
    ],
    [
      "aws_s3_bucket_cors_configuration",
      { parentAttribute: "bucket", properties: cors },
    ],
    [
      "aws_s3_bucket_server_side_encryption_configuration",
      { parentAttribute: "bucket", properties: encryption },
    ],
  ]);

function versioning(
  context: TerraformMappingContext,
): Record<string, SimCfnTemplateValue> {
  const configured = block(context, "versioning_configuration");

  if (configured === undefined) {
    return {};
  }

  const enabled = field(configured, "status") === "Enabled";

  return {
    VersioningConfiguration: { Status: enabled ? "Enabled" : "Suspended" },
  };
}

function publicAccess(
  context: TerraformMappingContext,
): Record<string, SimCfnTemplateValue> {
  return {
    PublicAccessBlockConfiguration: renamed(context, {
      BlockPublicAcls: "block_public_acls",
      BlockPublicPolicy: "block_public_policy",
      IgnorePublicAcls: "ignore_public_acls",
      RestrictPublicBuckets: "restrict_public_buckets",
    }),
  };
}
