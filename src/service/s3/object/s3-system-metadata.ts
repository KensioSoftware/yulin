/**
 * One header S3 keeps about an Object when it is written and hands back,
 * unchanged, on every read.
 *
 * The request field a write sets the header with and the key the value is
 * stored under are paired here rather than in the write and read paths. Adding
 * a header to the list below adds it to `PutObject` and to every endpoint that
 * serves an Object at the same time, so the two sides cannot drift apart.
 *
 * https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingMetadata.html
 */
export class SimS3SystemMetadataHeader {
  constructor(
    public readonly field: SimS3SystemMetadataField,
    public readonly name: string,
  ) {}
}

/**
 * The request field name a write sets a system metadata header with.
 *
 * These are the AWS SDK spellings, so an input carrying system metadata is
 * indexable by them.
 */
export type SimS3SystemMetadataField =
  | "CacheControl"
  | "ContentDisposition"
  | "ContentEncoding"
  | "ContentLanguage"
  | "ContentType"
  | "Expires";

/**
 * System metadata values, under the request field names a `PutObject` sets
 * them with.
 *
 * Every value is a string here, including `Expires`, which a `PutObject` takes
 * as a `Date`. Nothing is being written, so there is no request field to format:
 * this says what S3 already holds about a file, in the form a read hands back.
 */
export type SimS3SystemMetadataValues = Partial<
  Record<SimS3SystemMetadataField, string>
>;

/**
 * The system metadata S3 stores as a header and returns as one.
 *
 * Content length is not here because it describes the body rather than being
 * remembered about it, and content type is set for almost every Object because
 * a deployment or the console guesses one from the file extension.
 */
export const simS3SystemMetadataHeaders: readonly SimS3SystemMetadataHeader[] =
  [
    new SimS3SystemMetadataHeader("CacheControl", "cache-control"),
    new SimS3SystemMetadataHeader("ContentDisposition", "content-disposition"),
    new SimS3SystemMetadataHeader("ContentEncoding", "content-encoding"),
    new SimS3SystemMetadataHeader("ContentLanguage", "content-language"),
    new SimS3SystemMetadataHeader("ContentType", "content-type"),
    new SimS3SystemMetadataHeader("Expires", "expires"),
  ];

/**
 * The type S3 gives an Object whose write named none.
 *
 * S3 guesses nothing from the key, so a `.txt` file uploaded without a content
 * type is served as bytes. Tooling that appears to guess, such as `aws s3
 * sync`, sets the header itself before the upload.
 */
export const simS3DefaultContentType = "binary/octet-stream";

/**
 * Read system metadata written as headers back into the fields it is declared
 * with.
 *
 * A `Custom::CDKBucketDeployment` carries its `SystemMetadata` as the headers
 * the sync sets, which is the form an Object holds them in and the wrong form
 * to declare them in. Anything outside the list above is dropped: only these
 * are declarable, and only these are served.
 */
export function simS3SystemMetadataValues(
  headers: ReadonlyMap<string, string>,
): SimS3SystemMetadataValues {
  const values: SimS3SystemMetadataValues = {};

  for (const header of simS3SystemMetadataHeaders) {
    const value = headers.get(header.name);

    if (value !== undefined) {
      values[header.field] = value;
    }
  }

  return values;
}
