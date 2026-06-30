import path from "node:path";

import { FilesystemS3BucketStorage } from "../../../../s3/storage/filesystem/s3-filesystem-storage.js";
import type { SimCfnServiceResourceFactory } from "../../../resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../../resource/sim-cfn-resource.js";
import { SimCdkBucketDeploySource } from "./source/sim-cdk-bucket-deploy-source.js";
import { assertDefined } from "../../../../../util/type-guard/defined.js";

/**
 * CloudFormation Resource factory for CDK BucketDeployment compatibility.
 */
export class SimCdkBucketDeploymentResourceFactory implements SimCfnServiceResourceFactory {
  private readonly sourceResolver = new SimCdkBucketDeploySource();

  /**
   * Configure a simulated destination S3 Bucket for a CDK BucketDeployment.
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

    this.createCdkBucketDeployment(resource, context);

    await Promise.resolve();

    return undefined;
  }

  private createCdkBucketDeployment(
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): void {
    const properties = context.resolvedProperties ?? resource.properties;
    const destinationBucketName = properties["DestinationBucketName"];
    const sourceObjectKeys = properties["SourceObjectKeys"];

    /* v8 ignore if -- defensive catch */
    if (typeof destinationBucketName !== "string") {
      throw new TypeError(
        "Custom::CDKBucketDeployment DestinationBucketName must resolve to a string",
      );
    }

    /* v8 ignore if -- defensive catch */
    if (!Array.isArray(sourceObjectKeys)) {
      throw new TypeError(
        "Custom::CDKBucketDeployment SourceObjectKeys must be an array",
      );
    }

    /* v8 ignore if -- defensive catch */
    if (sourceObjectKeys.length !== 1) {
      throw new Error(
        "Custom::CDKBucketDeployment currently supports exactly one source object key",
      );
    }

    const [sourceObjectKey] = sourceObjectKeys;

    /* v8 ignore if -- defensive catch */
    if (typeof sourceObjectKey !== "string") {
      throw new TypeError(
        "Custom::CDKBucketDeployment SourceObjectKeys must contain a string object key",
      );
    }

    const sourceDirectoryPath =
      this.sourceResolver.sourceDirectoryPathForObjectKey(
        resource,
        sourceObjectKey,
        context.cdkOutContext,
      );
    const sourceDirectoryName = path.basename(sourceDirectoryPath);

    const bucket = context.simAws
      .accountRegionScope(
        resource.accountRegionScope.accountId,
        resource.accountRegionScope.regionName,
      )
      .s3()
      .getSimBucketByName(destinationBucketName);
    assertDefined(
      bucket,
      `Custom::CDKBucketDeployment destination Bucket ${destinationBucketName} does not exist`,
    );

    bucket.configureSimStorage(
      new FilesystemS3BucketStorage({
        directoryPath: sourceDirectoryPath,
        // Specifically allow the cdk.out asset directory we want to mount.
        allowedDirectoryNames: [sourceDirectoryName],
      }),
    );
  }
}
