import type { SimCfnServiceResourceFactory } from "../../../resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../../resource/sim-cfn-resource.js";
import { SimCdkBucketDeploySource } from "./source/sim-cdk-bucket-deploy-source.js";
import { SimCdkBucketDeployCopier } from "./copy/sim-cdk-bucket-deploy-copier.js";
import { SimCdkBucketDeployProperties } from "./property/sim-cdk-bucket-deploy-properties.js";
import { declareSimCdkBucketDeployMetadata } from "./metadata/sim-cdk-bucket-deploy-metadata.js";
import { simCdkBucketDeployNotifier } from "./notify/sim-cdk-bucket-deploy-notifier.js";
import { simCdkBucketDeployDestination } from "./destination/sim-cdk-bucket-deploy-destination.js";

/**
 * CloudFormation Resource factory for CDK BucketDeployment compatibility.
 */
export class SimCdkBucketDeploymentResourceFactory implements SimCfnServiceResourceFactory {
  private readonly sourceResolver = new SimCdkBucketDeploySource();

  /**
   * Copy a CDK BucketDeployment's staged asset into its destination Bucket.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<undefined> {
    if (resourceTypeName !== "CDKBucketDeployment") {
      throw new Error(
        `Unsupported sim CDK BucketDeployment Resource ${resourceTypeName}`,
      );
    }

    await this.createCdkBucketDeployment(resource, context);

    return undefined;
  }

  /**
   * Undeploy a CDK BucketDeployment.
   *
   * Nothing happens, because nothing happens on AWS either. The provider
   * function keeps what it deployed unless the construct was given
   * `retainOnDelete: false`, so the Objects stay in the Bucket, and the
   * Bucket's own deletion is refused while they do.
   */
  async delete(resourceTypeName: string): Promise<void> {
    await Promise.resolve();

    if (resourceTypeName !== "CDKBucketDeployment") {
      throw new Error(
        `Unsupported sim CDK BucketDeployment CloudFormation Resource ` +
          `${resourceTypeName} deletion`,
      );
    }
  }

  private async createCdkBucketDeployment(
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<void> {
    const properties = new SimCdkBucketDeployProperties(
      resource,
      context.resolvedProperties ?? resource.properties,
    );

    const bucket = simCdkBucketDeployDestination(resource, properties, context);

    const sourceDirectoryPaths = this.sourceResolver.sourceDirectoryPaths(
      resource,
      properties.sourceObjectKeys,
      context.cdkOutContext,
    );

    // The copier writes Objects into the Bucket instead of sending PutObject,
    // and a Bucket configured to notify still hears about every file it writes
    // and every Object it prunes.
    const publishedKeys = await new SimCdkBucketDeployCopier({
      bucket,
      properties,
      notifier: simCdkBucketDeployNotifier(resource, bucket, context),
    }).copy(sourceDirectoryPaths);

    // Said as well as set. The Objects above carry these headers themselves,
    // and a directory mounted over them later cannot, so the Bucket keeps what
    // this deployment publishes for storage that has only files to go on.
    declareSimCdkBucketDeployMetadata({
      bucket,
      resource,
      properties,
      publishedKeys,
    });
  }
}
