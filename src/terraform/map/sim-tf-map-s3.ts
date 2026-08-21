/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import {
  properties,
  renamed,
  tags,
  type TerraformMappingContext,
} from "../sim-tf-attributes.js";
import type { TerraformMappedResource } from "../sim-tf-mapping.type.js";

/** A bucket. What configures it arrives as its own resource and folds in. */
export function s3Bucket(
  context: TerraformMappingContext,
): TerraformMappedResource {
  return {
    Type: "AWS::S3::Bucket",
    Properties: {
      ...renamed(context, { BucketName: "bucket" }),
      ...properties({ Tags: tags(context) }),
    },
  };
}
