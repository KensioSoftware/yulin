import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import { simS3ObjectPage } from "../../object/s3-object-listing.js";
import { simS3ObjectSummaries } from "../../object/s3-object-summary.js";
import type { SimListObjectsCommandOutput } from "./list-objects.command.js";

interface ListObjectsPageInput {
  readonly bucket: SimS3Bucket;
  readonly prefix?: string | undefined;
  readonly marker?: string | undefined;
  readonly maxKeys: number;
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
 * NextMarker is returned only when another page exists and identifies the final
 * key in the current page.
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
      startAfter: input.marker,
      maxKeys: input.maxKeys,
    });

    return {
      Contents: simS3ObjectSummaries(page.objects),
      Name: input.bucket.bucketName,
      Prefix: input.prefix,
      Marker: input.marker,
      MaxKeys: input.maxKeys,
      IsTruncated: page.isTruncated,
      NextMarker: page.isTruncated ? page.lastKey : undefined,
      $metadata: {},
    };
  }
}
