import type {
  SimListBucketsCommandInput,
  SimListBucketsCommandOutput,
} from "./list-buckets.cmd.js";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";

interface ListBucketsPageBuilderProperties {
  readonly buckets: ReadonlyMap<SimS3BucketName, SimS3Bucket>;
}

type ListBucketsPage = Omit<SimListBucketsCommandOutput, "$metadata">;

/**
 * Builds one page of an S3 ListBuckets response.
 *
 * IAM authorization remains in the command handler because it controls whether
 * Bucket state may be read at all. This class handles the data operations that
 * happen after authorization: stable ordering, prefix filtering, continuation
 * token interpretation, page selection, and generation of the next token.
 *
 * Continuation tokens encode the final Bucket name from the previous page. Since
 * Bucket names are globally unique and the collection is sorted by name, that
 * name provides a stable position from which to continue. If the referenced
 * Bucket is absent, listing restarts at the beginning rather than producing a
 * negative array index.
 */
export class ListBucketsPageBuilder {
  private readonly buckets: ReadonlyMap<SimS3BucketName, SimS3Bucket>;

  constructor(properties: ListBucketsPageBuilderProperties) {
    this.buckets = properties.buckets;
  }

  /**
   * Build the response fields for one ListBuckets page.
   *
   * Response metadata is owned by the command handler, so it is not included in
   * this result. Keeping protocol metadata outside this class lets the pagination
   * logic remain focused on Bucket collection state and request parameters.
   */
  build(input: SimListBucketsCommandInput): ListBucketsPage {
    const matchingBuckets = this.matchingBuckets(input.Prefix);
    const startIndex = this.startIndex(
      matchingBuckets,
      input.ContinuationToken,
    );
    const maxBuckets = input.MaxBuckets ?? 10_000;
    const page = matchingBuckets.slice(startIndex, startIndex + maxBuckets);

    return {
      Buckets: page.map((bucket) => ({
        Name: bucket.bucketName,
      })),
      ContinuationToken: this.nextContinuationToken(
        page,
        startIndex,
        matchingBuckets.length,
      ),
      Prefix: input.Prefix,
    };
  }

  /**
   * Return Buckets in the name order used by continuation tokens.
   *
   * A new array is sorted so listing cannot change insertion order in the
   * service's Bucket map. Prefix filtering happens after sorting, preserving the
   * same relative order for filtered and unfiltered requests.
   */
  private matchingBuckets(prefix?: string): SimS3Bucket[] {
    const buckets = this.buckets.values().toArray();
    buckets.sort((a, b) => a.bucketName.localeCompare(b.bucketName));

    return prefix === undefined
      ? buckets
      : buckets.filter((bucket) => bucket.bucketName.startsWith(prefix));
  }

  /**
   * Find the first Bucket to include after a continuation token.
   *
   * The token identifies the last Bucket returned by the preceding page, so the
   * next page starts one position later. A missing or unknown token position maps
   * to index zero, matching the previous handler behavior.
   */
  private startIndex(
    buckets: readonly SimS3Bucket[],
    continuationToken?: string,
  ): number {
    if (continuationToken === undefined) {
      return 0;
    }

    const startBucketName = this.parseContinuationToken(continuationToken);

    return Math.max(
      0,
      buckets.findIndex((bucket) => bucket.bucketName === startBucketName) + 1,
    );
  }

  /**
   * Create a token only when another Bucket remains after this page.
   *
   * Empty pages have no final Bucket from which to form a token. A final page
   * also omits the token so callers can detect completion.
   */
  private nextContinuationToken(
    page: readonly SimS3Bucket[],
    startIndex: number,
    matchingBucketCount: number,
  ): string | undefined {
    const lastBucket = page.at(-1);
    const hasMoreBuckets = startIndex + page.length < matchingBucketCount;

    return hasMoreBuckets && lastBucket !== undefined
      ? this.makeContinuationToken(lastBucket.bucketName)
      : undefined;
  }

  /**
   * Encode a Bucket name as an opaque URL-safe continuation token.
   */
  private makeContinuationToken(bucketName: string): string {
    return Buffer.from(bucketName, "utf8").toString("base64url");
  }

  /**
   * Recover the Bucket name represented by a continuation token.
   */
  private parseContinuationToken(token: string): string {
    return Buffer.from(token, "base64url").toString("utf8");
  }
}
