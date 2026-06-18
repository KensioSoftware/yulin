import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimS3 } from "../sim-s3.js";
import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type { SimS3Bucket } from "../bucket/sim-s3-bucket.js";

/**
 * CloudFormation Resource factory for simulated S3 resources.
 */
export class SimS3CloudFormationResourceFactory implements SimCfnServiceResourceFactory {
  constructor(private readonly simS3: SimS3) {}

  /**
   * Create a simulated S3 resource from a CloudFormation Resource.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    void context;

    switch (resourceTypeName) {
      case "Bucket": {
        return await this.createBucket(resource);
      }
      default: {
        throw new Error(
          `Unsupported sim S3 CloudFormation Resource ${resourceTypeName}`,
        );
      }
    }
  }

  private async createBucket(resource: SimCfnResource): Promise<SimS3Bucket> {
    const bucketName = this.bucketNameForResource(resource);

    await this.simS3.createBucket({
      input: {
        Bucket: bucketName,
      },
    });

    const bucket = this.simS3.getSimBucketByName(bucketName);

    /* v8 ignore if -- cannot happen in practice */
    if (bucket === undefined) {
      throw new Error(
        `Expected sim S3 Bucket ${bucketName} to exist after CloudFormation creation`,
      );
    }

    return bucket;
  }

  private bucketNameForResource(resource: SimCfnResource): string {
    const bucketName = resource.properties["BucketName"];

    if (typeof bucketName === "string") {
      return bucketName;
    }

    return resource.logicalId.toLowerCase();
  }
}
