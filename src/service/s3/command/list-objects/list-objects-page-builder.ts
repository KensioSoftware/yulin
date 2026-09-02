import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import { simS3CommonPrefixes } from "../../object/s3-common-prefix.js";
import { simS3ObjectPage } from "../../object/s3-object-listing.js";
import type { SimS3ListingEncoding } from "../../object/s3-listing-encoding.js";
import { simS3ObjectSummaries } from "../../object/s3-object-summary.js";
import type { SimListObjectsCommandOutput } from "./list-objects.command.js";

interface ListObjectsPageInput {
  readonly bucket: SimS3Bucket;
  readonly prefix?: string | undefined;
  readonly delimiter?: string | undefined;
  readonly marker?: string | undefined;
  readonly maxKeys: number;
  readonly encoding: SimS3ListingEncoding;
}

/**
 * Reads, orders, and paginates Objects for a ListObjects response.
 *
 * Authorization is completed by the command handler before this class is
 * called. Keeping storage access here, behind that boundary, prevents a denied
 * request from examining Object keys or sizes.
 *
 * Ordering and page selection are shared with ListObjectsV2, since the two
 * operations differ in how a caller names where to resume rather than in which
 * keys a page holds. The marker is exclusive, so a page begins after it.
 *
 * The keys, the prefix, the delimiter and both markers are written the way the
 * listing asked for them, which is encoded or as they are stored.
 *
 * NextMarker is returned only when another page exists, and identifies the
 * final entry in the current page. That entry is a common prefix where the
 * page ended on one, and the marker steps over the whole rolled-up prefix.
 */
export class ListObjectsPageBuilder {
  /**
   * Build one response page from the authorized Bucket listing.
   */
  async build(
    input: ListObjectsPageInput,
  ): Promise<SimListObjectsCommandOutput> {
    const page = simS3ObjectPage({
      objects: await input.bucket.listObjects(input.prefix),
      prefix: input.prefix,
      delimiter: input.delimiter,
      startAfter: input.marker,
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
      Marker: encoding.value(input.marker),
      MaxKeys: input.maxKeys,
      IsTruncated: page.isTruncated,
      NextMarker: encoding.value(page.resumeAfter),
      EncodingType: encoding.encodingType,
      $metadata: {},
    };
  }
}
