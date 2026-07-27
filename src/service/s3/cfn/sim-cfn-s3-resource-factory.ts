import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimS3 } from "../sim-s3.js";
import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import { SimCfnS3BucketCreator } from "./bucket/sim-cfn-s3-bucket-creator.js";
import { SimCfnS3BucketPolicyCreator } from "./bucket-policy/sim-cfn-s3-bucket-policy-creator.js";

/**
 * CloudFormation Resource factory for simulated S3 resources.
 */
export class SimS3CloudFormationResourceFactory implements SimCfnServiceResourceFactory {
  private readonly bucketCreator: SimCfnS3BucketCreator;
  private readonly bucketPolicyCreator: SimCfnS3BucketPolicyCreator;

  constructor(simS3: SimS3) {
    this.bucketCreator = new SimCfnS3BucketCreator({ simS3 });
    this.bucketPolicyCreator = new SimCfnS3BucketPolicyCreator({ simS3 });
  }

  /**
   * Create a simulated S3 resource from a CloudFormation Resource.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    switch (resourceTypeName) {
      case "Bucket": {
        return await this.bucketCreator.create(
          resource,
          context.resolvedProperties ?? resource.properties,
        );
      }
      case "BucketPolicy": {
        return await this.bucketPolicyCreator.create(
          resource,
          context.resolvedProperties ?? resource.properties,
        );
      }
      default: {
        throw new Error(
          `Unsupported sim S3 CloudFormation Resource ${resourceTypeName}`,
        );
      }
    }
  }
}
