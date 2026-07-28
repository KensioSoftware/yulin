import { SimS3Bucket } from "../../../../s3/bucket/sim-s3-bucket.js";
import { SimS3BucketCfn } from "./sim-s3-bucket-cfn.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";

/**
 * The CloudFormation-facing value adapter for a simulated S3 Resource.
 */
export function s3ValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  if (
    properties.type === "AWS::S3::Bucket" &&
    properties.simResource instanceof SimS3Bucket
  ) {
    return new SimS3BucketCfn({ bucket: properties.simResource });
  }

  return undefined;
}
