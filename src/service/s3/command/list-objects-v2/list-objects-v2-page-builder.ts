import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import { simS3CommonPrefixes } from "../../object/s3-common-prefix.js";
import { simS3ObjectPage } from "../../object/s3-object-listing.js";
import type { SimS3ListingEncoding } from "../../object/s3-listing-encoding.js";
import { simS3ObjectSummaries } from "../../object/s3-object-summary.js";
import {
  simS3ContinuationToken,
  simS3ContinuationTokenKey,
} from "./list-objects-v2-continuation-token.js";
import type { SimListObjectsV2CommandOutput } from "./list-objects-v2.command.js";

interface ListObjectsV2PageInput {
  readonly bucket: SimS3Bucket;
  readonly prefix?: string | undefined;
  readonly delimiter?: string | undefined;
  readonly continuationToken?: string | undefined;
  readonly startAfter?: string | undefined;
  readonly maxKeys: number;
  readonly encoding: SimS3ListingEncoding;
}

/**
 * Reads, orders, and paginates Objects for a ListObjectsV2 response.
 *
 * Authorization is completed by the command handler before this class is
 * called, as it is for the first version of the operation, so a denied request
 * cannot examine Object keys or sizes.
 *
 * The keys, the prefix, the delimiter and the key a first page started after
 * are written the way the listing asked for them, which is encoded or as they
 * are stored. A continuation token is not, because it is opaque either way.
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
      prefix: input.prefix,
      delimiter: input.delimiter,
      startAfter: this.resumeAfter(input),
      maxKeys: input.maxKeys,
    });

    const { encoding } = input;

    return {
      Contents: encoding.summaries(simS3ObjectSummaries(page.objects)),
      CommonPrefixes: encoding.commonPrefixes(
        simS3CommonPrefixes(page.commonPrefixes),
      ),
      Name: input.bucket.bucketName,
      Prefix: encoding.value(input.prefix),
      Delimiter: encoding.value(input.delimiter),
      MaxKeys: input.maxKeys,
      KeyCount: page.objects.length + page.commonPrefixes.length,
      IsTruncated: page.isTruncated,
      ContinuationToken: input.continuationToken,
      NextContinuationToken:
        page.resumeAfter === undefined
          ? undefined
          : simS3ContinuationToken(page.resumeAfter),
      StartAfter: encoding.value(input.startAfter),
      EncodingType: encoding.encodingType,
      $metadata: {},
    };
  }

  private resumeAfter(input: ListObjectsV2PageInput): string | undefined {
    return input.continuationToken === undefined
      ? input.startAfter
      : simS3ContinuationTokenKey(input.continuationToken);
  }
}
