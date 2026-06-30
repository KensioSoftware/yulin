import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimS3 } from "../sim-s3.js";
import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type { SimS3Bucket } from "../bucket/sim-s3-bucket.js";
import type { SimS3WebsiteConfiguration } from "../command/put-bucket-website/put-bucket-website.cmd.js";
import { validateS3BucketName } from "../bucket/validate/validate-s3-bucket-name.js";
import { assertDefined } from "../../../util/type-guard/defined.js";

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
    switch (resourceTypeName) {
      case "Bucket": {
        return await this.createBucket(resource, context);
      }
      default: {
        throw new Error(
          `Unsupported sim S3 CloudFormation Resource ${resourceTypeName}`,
        );
      }
    }
  }

  private async createBucket(
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<SimS3Bucket> {
    const bucketName = this.bucketNameForResource(resource, context);
    validateS3BucketName(bucketName);

    await this.simS3.createBucket({
      input: {
        Bucket: bucketName,
      },
    });

    const bucket = this.simS3.getSimBucketByName(bucketName);
    assertDefined(
      bucket,
      `sim S3 Bucket ${bucketName} after CloudFormation creation`,
    );

    const websiteConfiguration = this.websiteConfigurationForResource(
      resource,
      context,
    );

    if (websiteConfiguration !== undefined) {
      await this.simS3.putBucketWebsite({
        input: {
          Bucket: bucketName,
          WebsiteConfiguration: websiteConfiguration,
        },
      });
    }

    return bucket;
  }

  private bucketNameForResource(
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): string {
    const properties = context.resolvedProperties ?? resource.properties;
    const bucketName = properties["BucketName"];

    if (typeof bucketName === "string") {
      return bucketName;
    }

    return resource.logicalId.toLowerCase();
  }

  private websiteConfigurationForResource(
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): SimS3WebsiteConfiguration | undefined {
    const properties = context.resolvedProperties ?? resource.properties;
    const websiteConfiguration = properties["WebsiteConfiguration"];

    if (
      websiteConfiguration === undefined ||
      websiteConfiguration === null ||
      typeof websiteConfiguration !== "object" ||
      Array.isArray(websiteConfiguration)
    ) {
      return undefined;
    }

    if (
      "RoutingRules" in websiteConfiguration &&
      !Array.isArray(websiteConfiguration["RoutingRules"])
    ) {
      return undefined;
    }

    return {
      ...websiteConfiguration,
      IndexDocument:
        typeof websiteConfiguration["IndexDocument"] === "string"
          ? {
              Suffix: websiteConfiguration["IndexDocument"],
            }
          : websiteConfiguration["IndexDocument"],
      ErrorDocument:
        typeof websiteConfiguration["ErrorDocument"] === "string"
          ? {
              Key: websiteConfiguration["ErrorDocument"],
            }
          : websiteConfiguration["ErrorDocument"],
    } as SimS3WebsiteConfiguration;
  }
}
