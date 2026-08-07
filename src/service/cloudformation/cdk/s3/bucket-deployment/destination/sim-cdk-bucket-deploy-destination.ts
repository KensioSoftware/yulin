import { assertDefined } from "../../../../../../util/type-guard/defined.js";
import type { SimS3Bucket } from "../../../../../s3/bucket/sim-s3-bucket.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../../../resource/sim-cfn-resource.js";
import type { SimCdkBucketDeployProperties } from "../property/sim-cdk-bucket-deploy-properties.js";

/**
 * The simulated Bucket a deployment publishes into.
 *
 * A deployment names its destination rather than referring to it, so the Bucket
 * is found by name, in the account and Region the Resource itself belongs to.
 * It has to be there: the provider function runs after the Bucket is created,
 * and a deployment into a Bucket that does not exist is a template saying
 * something that cannot happen rather than something to work around.
 */
export function simCdkBucketDeployDestination(
  resource: SimCfnResource,
  properties: SimCdkBucketDeployProperties,
  context: SimCloudFormationResourceCreateContext,
): SimS3Bucket {
  const { accountId, regionName } = resource.accountRegionScope;
  const bucket = context.simAws
    .accountRegionScope(accountId, regionName)
    .s3()
    .getSimBucketByName(properties.destinationBucketName);

  assertDefined(
    bucket,
    `Custom::CDKBucketDeployment destination Bucket ${properties.destinationBucketName} does not exist`,
  );

  return bucket;
}
