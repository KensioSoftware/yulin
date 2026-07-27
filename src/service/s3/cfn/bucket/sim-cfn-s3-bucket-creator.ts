import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimS3 } from "../../sim-s3.js";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import type { SimS3PublicAccessBlockConfiguration } from "../../bucket/public-access/sim-s3-public-access-block.js";
import type { SimS3WebsiteConfiguration as SimS3WebsiteConfig } from "../../command/put-bucket-website/put-bucket-website.command.js";
import { validateS3BucketName } from "../../bucket/validate/validate-s3-bucket-name.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";

interface SimCfnS3BucketCreatorProperties {
  readonly simS3: SimS3;
}

/**
 * Creates simulated S3 Buckets from AWS::S3::Bucket CloudFormation Resources.
 */
export class SimCfnS3BucketCreator {
  private readonly simS3: SimS3;

  constructor(properties: SimCfnS3BucketCreatorProperties) {
    this.simS3 = properties.simS3;
  }

  /**
   * Create a simulated Bucket, with its website configuration when declared.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimS3Bucket> {
    const bucketName = this.bucketNameForResource(resource, properties);
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

    const websiteConfig = this.websiteConfigurationForResource(properties);

    if (websiteConfig !== undefined) {
      await this.simS3.putBucketWebsite({
        input: {
          Bucket: bucketName,
          WebsiteConfiguration: websiteConfig,
        },
      });
    }

    const publicAccessConfig =
      this.publicAccessConfigurationForResource(properties);

    if (publicAccessConfig !== undefined) {
      await this.simS3.putPublicAccessBlock({
        input: {
          Bucket: bucketName,
          PublicAccessBlockConfiguration: publicAccessConfig,
        },
      });
    }

    return bucket;
  }

  /**
   * Read PublicAccessBlockConfiguration, which a template uses to open a
   * Bucket up from the all-blocked state a new Bucket starts in.
   */
  private publicAccessConfigurationForResource(
    properties: SimCfnTemplateValueRecord,
  ): SimS3PublicAccessBlockConfiguration | undefined {
    const publicAccessConfig = properties["PublicAccessBlockConfiguration"];

    if (
      publicAccessConfig === undefined ||
      publicAccessConfig === null ||
      typeof publicAccessConfig !== "object" ||
      Array.isArray(publicAccessConfig)
    ) {
      return undefined;
    }

    return publicAccessConfig;
  }

  private bucketNameForResource(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): string {
    const bucketName = properties["BucketName"];

    if (typeof bucketName === "string") {
      return bucketName;
    }

    return resource.logicalId.toLowerCase();
  }

  private websiteConfigurationForResource(
    properties: SimCfnTemplateValueRecord,
  ): SimS3WebsiteConfig | undefined {
    const websiteConfig = properties["WebsiteConfiguration"];

    if (
      websiteConfig === undefined ||
      websiteConfig === null ||
      typeof websiteConfig !== "object" ||
      Array.isArray(websiteConfig)
    ) {
      return undefined;
    }

    if (
      "RoutingRules" in websiteConfig &&
      !Array.isArray(websiteConfig["RoutingRules"])
    ) {
      return undefined;
    }

    return {
      ...websiteConfig,
      IndexDocument:
        typeof websiteConfig["IndexDocument"] === "string"
          ? {
              Suffix: websiteConfig["IndexDocument"],
            }
          : websiteConfig["IndexDocument"],
      ErrorDocument:
        typeof websiteConfig["ErrorDocument"] === "string"
          ? {
              Key: websiteConfig["ErrorDocument"],
            }
          : websiteConfig["ErrorDocument"],
    } as SimS3WebsiteConfig;
  }
}
