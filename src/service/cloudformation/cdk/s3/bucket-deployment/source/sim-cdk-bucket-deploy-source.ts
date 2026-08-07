import path from "node:path";

import type { SimCfnResource } from "../../../../resource/sim-cfn-resource.js";
import type {
  SimCdkAssetsManifest,
  SimCdkOutContext,
} from "../../../sim-cdk-out-context.js";
import { SimCdkBucketDeployErrorMessage } from "../error-message/sim-cdk-bucket-deploy-error-message.js";

/**
 * Resolves the filesystem source directory for a CDK BucketDeployment asset.
 */
export class SimCdkBucketDeploySource {
  /**
   * Find the local source directory for a CDK BucketDeployment source object key.
   */
  sourceDirectoryPathForObjectKey(
    resource: SimCfnResource,
    sourceObjectKey: string,
    cdkOutContext: SimCdkOutContext | undefined,
  ): string {
    const assetsManifest = cdkOutContext?.assetsManifest;
    const templateDirectoryPath = cdkOutContext?.templateDirectoryPath;

    if (assetsManifest === undefined || templateDirectoryPath === undefined) {
      throw new Error(
        [
          `Could not configure Custom::CDKBucketDeployment ${resource.logicalId}.`,
          "",
          "Referenced source object key:",
          sourceObjectKey,
          "",
          "No CDK assets manifest is available.",
          "",
          "Deploy from a synthesized CDK template file, or run `cdk synth` and ensure the cloud assembly is available.",
        ].join("\n"),
      );
    }

    const fileAsset = this.fileAssetForObjectKey(
      assetsManifest,
      sourceObjectKey,
    );

    // oxlint-disable-next-line yulin/assert-defined-guard -- `assertDefined` cannot narrow through the optional chain, which the packaging check below relies on, and its message would have to be built on every call rather than only on failure
    if (fileAsset?.source?.path === undefined) {
      const errorMessage = new SimCdkBucketDeployErrorMessage({
        resource,
        sourceObjectKey,
        cdkOutContext,
        reason: "No matching CDK file asset with a source path was found.",
      });
      throw new Error(errorMessage.toString());
    }

    if (fileAsset.source.packaging !== "zip") {
      const errorMessage = new SimCdkBucketDeployErrorMessage({
        resource,
        sourceObjectKey,
        cdkOutContext,
        reason: `Expected CDK file asset packaging "zip", got ${String(
          fileAsset.source.packaging,
        )}.`,
      });
      throw new Error(errorMessage.toString());
    }

    const resolvedTemplateDirectoryPath = path.resolve(templateDirectoryPath);
    const resolvedAssetPath = path.resolve(
      resolvedTemplateDirectoryPath,
      fileAsset.source.path,
    );

    if (
      resolvedAssetPath !== resolvedTemplateDirectoryPath &&
      !resolvedAssetPath.startsWith(
        `${resolvedTemplateDirectoryPath}${path.sep}`,
      )
    ) {
      const errorMessage = new SimCdkBucketDeployErrorMessage({
        resource,
        sourceObjectKey,
        cdkOutContext,
        reason: `CDK file asset source path escapes the template directory: ${fileAsset.source.path}`,
      });
      throw new Error(errorMessage.toString());
    }

    return resolvedAssetPath;
  }

  private fileAssetForObjectKey(
    assetsManifest: SimCdkAssetsManifest,
    sourceObjectKey: string,
  ): NonNullable<SimCdkAssetsManifest["files"]>[string] | undefined {
    return Object.values(assetsManifest.files ?? {}).find((fileAsset) => {
      return Object.values(fileAsset.destinations ?? {}).some((destination) => {
        return destination.objectKey === sourceObjectKey;
      });
    });
  }
}
