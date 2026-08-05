import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimS3Bucket } from "../bucket/sim-s3-bucket.js";
import type { SimS3 } from "../sim-s3.js";
import { assertDefined } from "../../../util/type-guard/defined.js";

interface SimCfnS3ResourceDeleterProperties {
  readonly simS3: SimS3;
}

/**
 * Deletes the simulated S3 resources a CloudFormation Stack created.
 *
 * Both Resource types are deleted through the ordinary command path, so a
 * teardown is refused for the same reasons an SDK caller would be. The one that
 * matters is a Bucket still holding Objects: DeleteBucket answers BucketNotEmpty
 * and the Stack deletion fails, exactly as it does on AWS. Emptying the Bucket
 * first would be a kindness that hides the reason CDK ships an
 * `autoDeleteObjects` custom resource at all.
 */
export class SimCfnS3ResourceDeleter {
  private readonly simS3: SimS3;

  constructor(properties: SimCfnS3ResourceDeleterProperties) {
    this.simS3 = properties.simS3;
  }

  /**
   * Delete a simulated S3 resource created from a CloudFormation Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
  ): Promise<void> {
    switch (resourceTypeName) {
      case "Bucket": {
        await this.simS3.deleteBucket({
          input: { Bucket: this.bucketName(resource) },
        });

        return;
      }
      case "BucketPolicy": {
        await this.simS3.deleteBucketPolicy({
          input: { Bucket: this.bucketName(resource) },
        });

        return;
      }
      default: {
        throw new Error(
          `Unsupported sim S3 CloudFormation Resource ${resourceTypeName} deletion`,
        );
      }
    }
  }

  /**
   * The Bucket a Resource was created against.
   *
   * A Bucket policy has no existence of its own in S3, so its Resource carries
   * the Bucket it was put on, which is the Bucket to take it off again.
   */
  private bucketName(resource: SimCfnResource): string {
    const bucket = resource.simResource as SimS3Bucket | undefined;
    assertDefined(
      bucket,
      `sim S3 Bucket for CloudFormation Resource ${resource.logicalId}`,
    );

    return bucket.bucketName;
  }
}
