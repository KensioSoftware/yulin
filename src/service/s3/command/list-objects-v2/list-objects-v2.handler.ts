import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimListObjectsV2Command,
  SimListObjectsV2CommandOutput,
} from "./list-objects-v2.command.js";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import { SimS3NoSuchBucket } from "../../error/sim-s3.error.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimS3ListingEncoding } from "../../object/s3-listing-encoding.js";
import { simS3EffectiveMaxKeys } from "../../object/s3-object-listing.js";
import { SimS3ObjectListingLimits } from "../../object/s3-object-listing-limits.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import { ListObjectsAuthorizer } from "../list-objects/list-objects-authorizer.js";
import { ListObjectsV2PageBuilder } from "./list-objects-v2-page-builder.js";

interface ListObjectsV2CommandHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
  readonly listing?: SimS3ObjectListingLimits;
}

/**
 * Simulated S3 ListObjectsV2Command handler.
 *
 * The second version of the operation is the one current tooling reaches for.
 * It authorizes identically to the first, against `s3:ListBucket` on the
 * Bucket, and lists the same keys; the difference is a continuation token in
 * place of a marker, and a response that counts the keys it returned.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/ListObjectsV2Command/
 */
export class ListObjectsV2CommandHandler implements CommandHandler<
  SimListObjectsV2Command,
  SimListObjectsV2CommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: ListObjectsAuthorizer;
  private readonly pageBuilder = new ListObjectsV2PageBuilder();
  private readonly background: BackgroundScheduler;
  private readonly listing: SimS3ObjectListingLimits;

  constructor(properties: ListObjectsV2CommandHandlerProperties) {
    const {
      buckets,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
      listing = new SimS3ObjectListingLimits(),
    } = properties;

    this.buckets = buckets;
    this.authorizer = new ListObjectsAuthorizer({ iam });
    this.background = background;
    this.listing = listing;
  }

  /**
   * Coordinate validation, Bucket resolution, authorization, and pagination.
   *
   * Bucket lookup occurs before authorization so missing Buckets retain their
   * existing S3 error behavior. Authorization occurs before storage listing so
   * a denied caller cannot inspect Object keys or sizes.
   */
  async handle(
    command: SimListObjectsV2Command,
    options?: SimS3RequestOptions,
  ): Promise<SimListObjectsV2CommandOutput> {
    assertDefined(command.input.Bucket, "ListObjectsV2Command.input.Bucket");

    const bucketName = command.input.Bucket as SimS3BucketName;
    const bucket = this.buckets.get(bucketName);
    if (bucket === undefined) {
      throw new SimS3NoSuchBucket(`No S3 Bucket named ${bucketName}`);
    }

    // Complete request sequencing before authorization and storage access.
    await this.background.sequence();

    // Refused before anything is listed, the way real S3 refuses an argument
    // it cannot read, rather than after a page has been built.
    const encoding = new SimS3ListingEncoding(command.input.EncodingType);

    const maxKeys = simS3EffectiveMaxKeys(
      command.input.MaxKeys,
      this.listing.maxKeysPerPage,
    );

    this.authorizer.authorize({
      bucket,
      prefix: command.input.Prefix,
      delimiter: command.input.Delimiter,
      maxKeys,
      options,
    });

    return await this.pageBuilder.build({
      bucket,
      prefix: command.input.Prefix,
      delimiter: command.input.Delimiter,
      continuationToken: command.input.ContinuationToken,
      startAfter: command.input.StartAfter,
      maxKeys,
      encoding,
    });
  }
}
