import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimS3 } from "../../../s3/sim-s3.js";
import { SimCfnPseudoParameters } from "../../parameters/pseudo/sim-cfn-pseudo-parameters.js";
import type { SimCdkOutContext } from "../sim-cdk-out-context.js";
import {
  type SimCdkAssetPublication,
  SimCdkAssetPublications,
} from "./sim-cdk-asset-publications.js";
import { readSimCdkAssetBytes } from "./sim-cdk-asset-bytes.js";
import { simCfnResourceCallerOptions } from "../../resource/caller/sim-cfn-resource-caller-options.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";

interface SimCdkAssetsPublisherProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly stackName?: string | undefined;
  readonly cdkOutContext?: SimCdkOutContext | undefined;

  /**
   * The principal the assets are published as.
   *
   * A real `cdk deploy` publishes assets before CloudFormation sees the
   * template, as the file publishing Role the assets manifest names in each
   * destination's `assumeRoleArn`. CloudFormation then processes the template
   * as the execution Role. A deployment that names an assets caller is what
   * tells the two apart here, and one that names none publishes as whoever
   * deploys.
   */
  readonly assetsCaller?: SimAwsCaller | undefined;
}

/**
 * Publishes a CDK cloud assembly's file assets into simulated S3.
 *
 * A real `cdk deploy` runs in two phases: `cdk-assets` publishes every staged
 * file asset to the bootstrap staging bucket, and only then does CloudFormation
 * process a template whose `Code.S3Bucket`/`S3Key` already point at those
 * objects. Sim CloudFormation mirrors that ordering, so an asset-bundled
 * Lambda function resolves its code through the ordinary sim S3 fetch with no
 * Lambda-specific asset handling.
 *
 * Publishing is byte movement only. Nothing here runs asset code. Functions
 * sim Lambda cannot run, such as a CDK BucketDeployment provider written in
 * Python, are declined later by the Lambda resource creator on their Runtime.
 */
export class SimCdkAssetsPublisher {
  private readonly properties: SimCdkAssetsPublisherProperties;

  constructor(properties: SimCdkAssetsPublisherProperties) {
    this.properties = properties;
  }

  /**
   * Publish every publishable file asset in the cloud assembly to its staging
   * Bucket.
   *
   * Does nothing when the Stack was not deployed from a synthesized CDK
   * template, so inline templates keep their existing behavior.
   */
  async publish(): Promise<void> {
    const { cdkOutContext, accountRegionScope, stackName } = this.properties;
    const templateDirectoryPath = cdkOutContext?.templateDirectoryPath;

    if (cdkOutContext === undefined || templateDirectoryPath === undefined) {
      return;
    }

    const publications = new SimCdkAssetPublications({
      templateDirectoryPath,
      pseudoParameters: new SimCfnPseudoParameters({
        accountRegionScope,
        stackName,
      }),
    }).resolve(cdkOutContext.assetsManifest);

    for (const publication of publications) {
      // oxlint-disable-next-line no-await-in-loop -- published in manifest order, as cdk-assets publishes them
      await this.publishAsset(publication);
    }
  }

  private async publishAsset(
    publication: SimCdkAssetPublication,
  ): Promise<void> {
    const assetBytes = await this.readAssetBytes(publication);
    if (assetBytes === undefined) {
      return;
    }

    const s3 = this.stagingS3();

    this.ensureBucket(s3, publication.bucketName);
    await s3.putObject(
      {
        input: {
          Bucket: publication.bucketName,
          Key: publication.objectKey,
          Body: assetBytes,
        },
      },
      simCfnResourceCallerOptions(this.properties.assetsCaller),
    );
  }

  /**
   * Make the staging Bucket if this is the first asset published into it,
   * standing in for the CDK bootstrap stack that provisions it for real.
   *
   * The bootstrap stack runs long before the deployment, and neither the file
   * publishing Role nor the execution Role creates this Bucket. It comes
   * through `makeSimBucket` for that reason, which asks IAM nothing. A
   * deployment scoped to the permissions its real execution Role holds would
   * otherwise be refused `s3:CreateBucket` before creating a Resource.
   *
   * A name already taken in another scope is a real failure, and is reported.
   */
  private ensureBucket(s3: SimS3, bucketName: string): void {
    if (s3.getSimBucketByName(bucketName) === undefined) {
      s3.makeSimBucket(bucketName);
    }
  }

  private stagingS3(): SimS3 {
    const { simAws, accountRegionScope } = this.properties;

    return simAws
      .accountRegionScope(
        accountRegionScope.accountId,
        accountRegionScope.regionName,
      )
      .s3();
  }

  /**
   * Read asset bytes, treating an asset the cloud assembly references but does
   * not contain as unpublishable rather than as a Stack deployment failure.
   */
  private async readAssetBytes(
    publication: SimCdkAssetPublication,
  ): Promise<Uint8Array | undefined> {
    try {
      return await readSimCdkAssetBytes(
        publication.sourcePath,
        publication.packaging,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return undefined;
      }

      /* v8 ignore next */
      throw error;
    }
  }
}
