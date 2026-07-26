import path from "node:path";
import type { SimCfnPseudoParameters } from "../../parameters/pseudo/sim-cfn-pseudo-parameters.js";
import type { SimCdkAssetsManifest } from "../sim-cdk-out-context.js";

type SimCdkFileAsset = NonNullable<SimCdkAssetsManifest["files"]>[string];
type SimCdkAssetDestination = NonNullable<
  SimCdkFileAsset["destinations"]
>[string];

/**
 * One asset publication: a cloud assembly source to read, and the staging
 * Bucket location to publish it to.
 */
export interface SimCdkAssetPublication {
  readonly sourcePath: string;
  readonly packaging: string | undefined;
  readonly bucketName: string;
  readonly objectKey: string;
}

interface SimCdkAssetPublicationsProperties {
  readonly templateDirectoryPath: string;
  readonly pseudoParameters: SimCfnPseudoParameters;
}

/**
 * Works out what a CDK assets manifest asks to be published, and where.
 *
 * Manifest entries that cannot name both a readable source inside the cloud
 * assembly and a resolvable staging Bucket location are left out rather than
 * failing a Stack deployment before any Resource is created. What is left out
 * simply stays unpublished, and the Resource referencing it reports the
 * missing object through the ordinary sim S3 lookup.
 */
export class SimCdkAssetPublications {
  private readonly properties: SimCdkAssetPublicationsProperties;

  constructor(properties: SimCdkAssetPublicationsProperties) {
    this.properties = properties;
  }

  /**
   * The publishable entries of an assets manifest.
   */
  resolve(
    assetsManifest: SimCdkAssetsManifest | undefined,
  ): readonly SimCdkAssetPublication[] {
    return Object.values(assetsManifest?.files ?? {}).flatMap((fileAsset) =>
      this.fileAssetPublications(fileAsset),
    );
  }

  private fileAssetPublications(
    fileAsset: SimCdkFileAsset,
  ): readonly SimCdkAssetPublication[] {
    const sourcePath = this.assetSourcePath(fileAsset.source?.path);
    if (sourcePath === undefined) {
      return [];
    }

    return Object.values(fileAsset.destinations ?? {}).flatMap(
      (destination) => {
        const location = this.stagingLocation(destination);

        return location === undefined
          ? []
          : [
              {
                sourcePath,
                packaging: fileAsset.source?.packaging,
                ...location,
              },
            ];
      },
    );
  }

  private stagingLocation(
    destination: SimCdkAssetDestination,
  ): { bucketName: string; objectKey: string } | undefined {
    const bucketName = this.resolvedBucketName(destination.bucketName);
    const { objectKey } = destination;

    if (bucketName === undefined || objectKey === undefined) {
      return undefined;
    }

    return { bucketName, objectKey };
  }

  /**
   * Resolve a manifest Bucket name, which is literal for a Stack synthesized
   * with an explicit environment and pseudo-parameter templated otherwise.
   *
   * The same pseudo parameters resolve the template's own `Fn::Sub` Bucket
   * name, so the published location and the location a Resource fetches from
   * agree by construction. A name still holding a variable afterwards cannot
   * name a real Bucket, so nothing is published to it.
   */
  private resolvedBucketName(
    bucketName: string | undefined,
  ): string | undefined {
    if (bucketName === undefined) {
      return undefined;
    }

    const resolved = bucketName.replaceAll(
      /\$\{([^}]+)\}/gu,
      (match: string, parameterName: string) => {
        const value = this.properties.pseudoParameters.value(parameterName);

        return typeof value === "string" ? value : match;
      },
    );

    return resolved.includes("${") ? undefined : resolved;
  }

  /**
   * Resolve an asset source path inside the cloud assembly directory.
   *
   * Asset paths come from a file on disk, so a path escaping the assembly
   * directory is not published, mirroring the containment check the CDK
   * BucketDeployment source resolver applies before mounting a directory.
   */
  private assetSourcePath(sourcePath: string | undefined): string | undefined {
    if (sourcePath === undefined) {
      return undefined;
    }

    const directoryPath = path.resolve(this.properties.templateDirectoryPath);
    const resolvedSourcePath = path.resolve(directoryPath, sourcePath);

    if (!resolvedSourcePath.startsWith(`${directoryPath}${path.sep}`)) {
      return undefined;
    }

    return resolvedSourcePath;
  }
}
