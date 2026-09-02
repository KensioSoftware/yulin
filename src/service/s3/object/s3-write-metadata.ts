import { SimS3ObjectMetadata } from "./s3-object.js";
import {
  simS3DefaultContentType,
  simS3SystemMetadataHeaders,
  simS3UserMetadataPrefix,
  type SimS3SystemMetadataValues,
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
 * fails to compile. `Expires` is a `Date` where the SDK takes one and formats
 * it as an HTTP date, and the formatted string itself where the write arrived
 * over HTTP with the date already written out.
 */
export interface SimS3ObjectWriteMetadata {
  readonly Metadata?: Record<string, string> | undefined;
  readonly CacheControl?: string | undefined;
  readonly ContentDisposition?: string | undefined;
  readonly ContentEncoding?: string | undefined;
  readonly ContentLanguage?: string | undefined;
  readonly ContentType?: string | undefined;
  readonly Expires?: Date | string | undefined;
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

/**
 * Read the metadata headers of an upload into the members a write carries.
 *
 * A request arriving over HTTP states its metadata in the headers real S3
 * carries it in, which is the form a `PutObjectCommand` is serialized into by
 * the SDK. Reading them by the same list a write and a read agree on is what
 * keeps an upload over an endpoint describing an Object exactly as an
 * in-process one does.
 *
 * Every value stays a string, expiry included, because it arrives as the HTTP
 * date S3 stores rather than as a `Date` waiting to be formatted.
 */
export function simS3WriteMetadataHeaders(
  headers: Headers,
): SimS3ObjectWriteMetadata {
  const written: SimS3SystemMetadataValues = {};

  for (const header of simS3SystemMetadataHeaders) {
    const value = headers.get(header.name);

    if (value !== null) {
      written[header.field] = value;
    }
  }

  const attached = simS3AttachedMetadata(headers);

  return attached === undefined ? written : { ...written, Metadata: attached };
}

/**
 * The user-defined metadata an upload attached, or nothing where it attached
 * none.
 *
 * S3 sends each entry as its own `x-amz-meta-` header and answers a read with
 * the keys without the prefix, which is the form a write states them in. An
 * upload that attached nothing leaves `Metadata` absent rather than empty, so
 * a copy carrying the source's metadata is not handed an empty object to
 * copy over it.
 */
function simS3AttachedMetadata(
  headers: Headers,
): Record<string, string> | undefined {
  const attached: Record<string, string> = {};

  for (const [name, value] of headers) {
    if (name.toLowerCase().startsWith(simS3UserMetadataPrefix)) {
      attached[name.slice(simS3UserMetadataPrefix.length).toLowerCase()] =
        value;
    }
  }

  return Object.keys(attached).length === 0 ? undefined : attached;
}
