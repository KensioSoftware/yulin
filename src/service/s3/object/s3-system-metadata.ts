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
