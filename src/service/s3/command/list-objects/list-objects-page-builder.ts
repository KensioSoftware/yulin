import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
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
 * S3 returns keys in lexicographical order. The marker is exclusive, so a page
 * begins after the matching key. If the marker does not identify a stored key,
 * this simulation retains its existing behavior and starts from the beginning.
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
    const objects = await input.bucket.listObjects(input.prefix);
    objects.sort((a, b) => a.key.localeCompare(b.key));

    const startIndex =
      input.marker === undefined
        ? 0
        : Math.max(
            0,
            objects.findIndex((object) => object.key === input.marker) + 1,
          );

    const page = objects.slice(startIndex, startIndex + input.maxKeys);
    const lastObject = page.at(-1);
    const isTruncated = startIndex + page.length < objects.length;

    return {
      Contents: page.map((object) => ({
        Key: object.key,
        Size: object.body.length,
      })),
      Name: input.bucket.bucketName,
      Prefix: input.prefix,
      Marker: input.marker,
      MaxKeys: input.maxKeys,
      IsTruncated: isTruncated,
      NextMarker:
        isTruncated && lastObject !== undefined ? lastObject.key : undefined,
      $metadata: {},
    };
  }
}
