/** One S3 URI, read apart into the Bucket and the key prefix under it. */
export interface SimAthenaScannedLocation {
  readonly bucket: string;
  readonly prefix: string;
}

/**
 * Read an `s3://bucket/prefix` URI apart, or answer with nothing.
 *
 * A table location this cannot read is skipped rather than refused. Athena
 * would refuse it, and a table nobody queries for its bytes is a poor place to
 * start failing queries.
 */
export function simAthenaScannedLocation(
  uri: string,
): SimAthenaScannedLocation | undefined {
  if (!uri.startsWith("s3://")) {
    return undefined;
  }

  const withoutScheme = uri.slice("s3://".length);
  const separator = withoutScheme.indexOf("/");
  const bucket =
    separator === -1 ? withoutScheme : withoutScheme.slice(0, separator);

  if (bucket === "") {
    return undefined;
  }

  return {
    bucket,
    prefix: separator === -1 ? "" : withoutScheme.slice(separator + 1),
  };
}
