import { SimS3ObjectTagSet } from "./s3-object-tags.js";

/**
 * The tagging members of a request that stores an Object.
 *
 * `PutObject`, `CopyObject` and `CreateMultipartUpload` all carry `Tagging`,
 * and only a copy carries a directive, because only a copy has a source tag set
 * to choose between.
 */
export interface SimS3ObjectWriteTagging {
  /**
   * The tags to put on the Object, as the URL query string real S3 takes them
   * in: `department=finance&retention=long`.
   */
  readonly Tagging?: string | undefined;
}

/**
 * The tags a write asks S3 to put on the Object it is storing.
 *
 * Real S3 sends a tag set on a write as a query string rather than as a list,
 * because it travels in the `x-amz-tagging` header where a list has nowhere to
 * go. It is read the same way here, so an SDK caller and an HTTP one produce
 * the same tag set. A write naming no tags stores an untagged Object.
 */
export function simS3WriteTags(
  input: SimS3ObjectWriteTagging,
  context: string,
): SimS3ObjectTagSet {
  const tagging = input.Tagging;

  if (tagging === undefined) {
    return SimS3ObjectTagSet.empty();
  }

  return SimS3ObjectTagSet.from(
    new URLSearchParams(tagging)
      .entries()
      .map(([Key, Value]) => ({ Key, Value }))
      .toArray(),
    context,
  );
}
