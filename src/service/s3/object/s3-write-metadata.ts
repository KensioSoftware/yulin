import { SimS3ObjectMetadata } from "./s3-object.js";
import {
  simS3DefaultContentType,
  simS3SystemMetadataHeaders,
  simS3UserMetadataPrefix,
} from "./s3-system-metadata.js";

/**
 * The metadata members of a request that says what an Object is.
 *
 * `PutObject` and `CreateMultipartUpload` both carry these, because both of
 * them are the request that describes the Object rather than the one that
 * delivers its bytes. The fields below `Metadata` are the system metadata
 * headers S3 remembers about an Object and returns on a read. There is one for
 * every entry in `simS3SystemMetadataHeaders`, which is what the conversion
 * below reads them by, so a header added to that list without a field here
 * fails to compile. `Expires` is a `Date` because the SDK takes one and formats
 * it as an HTTP date.
 */
export interface SimS3ObjectWriteMetadata {
  readonly Metadata?: Record<string, string> | undefined;
  readonly CacheControl?: string | undefined;
  readonly ContentDisposition?: string | undefined;
  readonly ContentEncoding?: string | undefined;
  readonly ContentLanguage?: string | undefined;
  readonly ContentType?: string | undefined;
  readonly Expires?: Date | undefined;
}

/**
 * Convert the metadata members of a write into what an Object stores.
 *
 * User-defined metadata is stored under the `x-amz-meta-` prefix S3 carries it
 * with, which keeps a caller's own `content-type` key apart from the Object's
 * content type. System metadata is read by the same list of headers a read
 * returns, under the lowercase key that read looks the value up by, so a write
 * and a read agree on what S3 remembers about an Object. An omitted header
 * leaves its key absent rather than assigning an undefined value.
 *
 * Content type is the exception, because S3 gives an Object one whether the
 * write named it or not.
 */
export function simS3WriteMetadata(
  input: SimS3ObjectWriteMetadata,
): SimS3ObjectMetadata {
  const metadata: Record<string, string> = {};
  const userDefined = Object.entries(input.Metadata ?? {});

  for (const [key, value] of userDefined) {
    metadata[`${simS3UserMetadataPrefix}${key}`] = value;
  }

  for (const header of simS3SystemMetadataHeaders) {
    const value = metadataValue(input[header.field]);

    if (value !== undefined) {
      metadata[header.name] = value;
    }
  }

  metadata["content-type"] ??= simS3DefaultContentType;

  return new SimS3ObjectMetadata(metadata);
}

/**
 * Represent a system metadata value as the string S3 stores and returns.
 *
 * Only `Expires` arrives as a Date, which the SDK would otherwise format on
 * the wire. It becomes the same HTTP date here so the read side has a header
 * value to hand back rather than an object.
 */
function metadataValue(value: string | Date | undefined): string | undefined {
  if (value instanceof Date) {
    return value.toUTCString();
  }

  return value;
}
