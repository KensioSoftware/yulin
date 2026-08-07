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

interface SimCdkAssetsPublisherProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly stackName?: string | undefined;
  readonly cdkOutContext?: SimCdkOutContext | undefined;
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
 * Publishing is byte movement only; nothing here runs asset code. Functions
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
      // oxlint-disable-next-line no-await-in-loop -- assets sharing a staging Bucket must not race to create it
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
    await this.ensureBucket(s3, publication.bucketName);
    await s3.putObject({
      input: {
        Bucket: publication.bucketName,
        Key: publication.objectKey,
        Body: assetBytes,
      },
    });
  }

  /**
   * Create the staging Bucket if this is the first asset published into it,
   * standing in for the CDK bootstrap stack that provisions it for real.
   *
   * Stacks deployed concurrently share one staging Bucket, and creating it is
   * not atomic: sim S3 reaches a sequencing point before registering the
   * Bucket, so both can pass the check above and the loser is refused. A
   * Bucket that exists by the time the failure lands is the outcome this
   * wanted, whoever created it. Anything else, such as the name already being
   * taken in another scope, is a real failure and is reported.
   */
  private async ensureBucket(s3: SimS3, bucketName: string): Promise<void> {
    if (s3.getSimBucketByName(bucketName) !== undefined) {
      return;
    }

    try {
      await s3.createBucket({ input: { Bucket: bucketName } });
    } catch (error) {
      if (s3.getSimBucketByName(bucketName) === undefined) {
        throw error;
      }
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
