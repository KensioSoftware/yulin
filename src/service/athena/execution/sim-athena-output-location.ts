import { SimAthenaInvalidRequestException } from "../error/sim-athena.error.js";

/**
 * Where one query's results are written.
 *
 * An output location is an S3 URI, `s3://bucket/prefix/`. Athena puts one
 * object per query under it, named for the execution, so the Bucket and the
 * prefix are read apart here and joined back together per query.
 */
export class SimAthenaOutputLocation {
  public readonly bucketName: string;
  public readonly prefix: string;

  constructor(uri: string) {
    const withoutScheme = readScheme(uri);
    const separator = withoutScheme.indexOf("/");

    this.bucketName =
      separator === -1 ? withoutScheme : withoutScheme.slice(0, separator);
    this.prefix = separator === -1 ? "" : withoutScheme.slice(separator + 1);

    if (this.bucketName === "") {
      throw new SimAthenaInvalidRequestException(
        `Output location '${uri}' names no Bucket. An output location is ` +
          `an S3 URI, such as s3://results/queries/.`,
      );
    }
  }

  /**
   * The key one query's results are written under.
   *
   * Real Athena writes `<prefix>/<QueryExecutionId>.csv` for a query that
   * answers rows, and this does the same.
   */
  keyFor(queryExecutionId: string): string {
    const prefix =
      this.prefix === "" || this.prefix.endsWith("/")
        ? this.prefix
        : `${this.prefix}/`;

    return `${prefix}${queryExecutionId}.csv`;
  }

  /**
   * The S3 URI of one query's result object.
   */
  uriFor(queryExecutionId: string): string {
    return `s3://${this.bucketName}/${this.keyFor(queryExecutionId)}`;
  }
}

function readScheme(uri: string): string {
  if (!uri.startsWith("s3://")) {
    throw new SimAthenaInvalidRequestException(
      `Output location '${uri}' is not an S3 URI. An output location starts ` +
        `with s3://.`,
    );
  }

  return uri.slice("s3://".length);
}
