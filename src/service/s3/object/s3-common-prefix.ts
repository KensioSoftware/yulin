/**
 * One folder of a Bucket, as a listing under a delimiter describes it.
 *
 * Both list operations answer with these. A common prefix stands in for every
 * key beneath it, and carries no size, entity tag or timestamp of its own,
 * because S3 stores no such folder.
 */
export interface SimS3CommonPrefix {
  readonly Prefix?: string;
}

/**
 * Describe the prefixes a page rolled keys up into, or nothing when it rolled
 * up none.
 *
 * Real S3 leaves `CommonPrefixes` out of a listing that rolled nothing up,
 * matching the way it leaves `Contents` out of one that found no keys. A
 * caller written against AWS reaches for `CommonPrefixes ?? []`, and answering
 * with an empty array here would let one that skipped the guard pass a test
 * and fail against AWS.
 */
export function simS3CommonPrefixes(
  prefixes: readonly string[],
): SimS3CommonPrefix[] | undefined {
  return prefixes.length === 0
    ? undefined
    : prefixes.map((prefix) => ({ Prefix: prefix }));
}
