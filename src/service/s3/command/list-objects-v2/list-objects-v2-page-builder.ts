import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import {
  type SimS3ObjectPage,
  simS3ObjectPage,
} from "../../object/s3-object-listing.js";
import { simS3ObjectSummaries } from "../../object/s3-object-summary.js";
import {
  simS3ContinuationToken,
  simS3ContinuationTokenKey,
} from "./list-objects-v2-continuation-token.js";
import type { SimListObjectsV2CommandOutput } from "./list-objects-v2.command.js";

interface ListObjectsV2PageInput {
  readonly bucket: SimS3Bucket;
  readonly prefix?: string | undefined;
  readonly continuationToken?: string | undefined;
  readonly startAfter?: string | undefined;
  readonly maxKeys: number;
}

/**
 * Reads, orders, and paginates Objects for a ListObjectsV2 response.
 *
 * Authorization is completed by the command handler before this class is
 * called, as it is for the first version of the operation, so a denied request
 * cannot examine Object keys or sizes.
 *
 * The keys on a page are chosen exactly as ListObjects chooses them. What
 * differs is how a caller says where to carry on from: a continuation token
 * from the previous page, which wins, or a StartAfter key that positions the
 * first page only. That is why real S3 ignores StartAfter once a listing is
 * under way, and so does this.
 */
export class ListObjectsV2PageBuilder {
  /**
   * Build one response page from the authorized Bucket listing.
   */
  async build(
    input: ListObjectsV2PageInput,
  ): Promise<SimListObjectsV2CommandOutput> {
    const page = simS3ObjectPage({
      objects: await input.bucket.listObjects(input.prefix),
      startAfter: this.resumeAfter(input),
      maxKeys: input.maxKeys,
    });

    return {
      Contents: simS3ObjectSummaries(page.objects),
      Name: input.bucket.bucketName,
      Prefix: input.prefix,
      MaxKeys: input.maxKeys,
      KeyCount: page.objects.length,
      IsTruncated: page.isTruncated,
      ContinuationToken: input.continuationToken,
      NextContinuationToken: this.nextContinuationToken(
        page,
        input.continuationToken,
      ),
      StartAfter: input.startAfter,
      $metadata: {},
    };
  }

  private resumeAfter(input: ListObjectsV2PageInput): string | undefined {
    return input.continuationToken === undefined
      ? input.startAfter
      : simS3ContinuationTokenKey(input.continuationToken);
  }

  /**
   * The token that carries on from this page, when there is more to come.
   *
   * A page with keys on it resumes after the last of them. A truncated page
   * with none is the caller having asked for no keys at all, which makes no
   * progress, so the token they came with is handed back rather than one that
   * would skip the keys they have not seen.
   */
  private nextContinuationToken(
    page: SimS3ObjectPage,
    continuationToken: string | undefined,
  ): string | undefined {
    if (!page.isTruncated) {
      return undefined;
    }

    return page.lastKey === undefined
      ? continuationToken
      : simS3ContinuationToken(page.lastKey);
  }
}
