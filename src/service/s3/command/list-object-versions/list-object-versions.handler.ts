import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import { simS3VersionPage } from "../../bucket/versioning/sim-s3-version-page.js";
import { SimS3ObjectListingLimits } from "../../object/s3-object-listing-limits.js";
import { requireSimS3Bucket } from "../require-sim-s3-bucket.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import { SimS3VersioningAuthorizer } from "../versioning/sim-s3-versioning-authorizer.js";
import { ListObjectVersionsListing } from "./list-object-versions-listing.js";
import type {
  SimListObjectVersionsCommand,
  SimListObjectVersionsCommandOutput,
} from "./list-object-versions.command.js";

interface ListObjectVersionsHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
  readonly listing?: SimS3ObjectListingLimits;
}

/**
 * Simulated S3 ListObjectVersionsCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/ListObjectVersionsCommand/
 */
export class ListObjectVersionsCommandHandler implements CommandHandler<
  SimListObjectVersionsCommand,
  SimListObjectVersionsCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: SimS3VersioningAuthorizer;
  private readonly background: BackgroundScheduler;
  private readonly limits: SimS3ObjectListingLimits;

  constructor(properties: ListObjectVersionsHandlerProperties) {
    const {
      buckets,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
      listing = new SimS3ObjectListingLimits(),
    } = properties;

    this.buckets = buckets;
    this.authorizer = new SimS3VersioningAuthorizer({ iam });
    this.background = background;
    this.limits = listing;
  }

  /**
   * Authorize and report the versions a Bucket holds.
   *
   * Objects and delete markers come back in two lists, as real S3 sends them.
   * Both are paged together, so a page carrying the maximum number of entries
   * can hold some of each.
   */
  async handle(
    command: SimListObjectVersionsCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimListObjectVersionsCommandOutput> {
    assertDefined(
      command.input.Bucket,
      "ListObjectVersionsCommand.input.Bucket",
    );

    const bucketName = command.input.Bucket as SimS3BucketName;
    const bucket = requireSimS3Bucket(this.buckets, bucketName);

    await this.background.sequence();

    this.authorizer.authorizeList(bucket, options);

    const listing = new ListObjectVersionsListing(bucket);
    const maxKeys = this.pageSize(command.input.MaxKeys);
    const page = simS3VersionPage({
      versions: await listing.versions(command.input.Prefix),
      maxKeys,
      keyMarker: command.input.KeyMarker,
      versionIdMarker: command.input.VersionIdMarker,
    });

    return {
      Versions: listing.objectSummaries(page.versions),
      DeleteMarkers: listing.deleteMarkerSummaries(page.versions),
      Name: bucketName,
      Prefix: command.input.Prefix,
      MaxKeys: maxKeys,
      IsTruncated: page.isTruncated,
      KeyMarker: command.input.KeyMarker,
      VersionIdMarker: command.input.VersionIdMarker,
      NextKeyMarker: page.nextKeyMarker,
      NextVersionIdMarker: page.nextVersionIdMarker,
      $metadata: {},
    };
  }

  /**
   * How many entries this page holds.
   *
   * A caller asking for more than the Bucket's page size gets the page size,
   * which is the whole reason a listing has to be continued at all.
   */
  private pageSize(requested: number | undefined): number {
    const ceiling = this.limits.maxKeysPerPage;

    return requested === undefined
      ? ceiling
      : Math.min(Math.max(0, requested), ceiling);
  }
}
