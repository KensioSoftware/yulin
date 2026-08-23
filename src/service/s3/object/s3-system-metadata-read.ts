import {
  simS3SystemMetadataHeaders,
  simS3UserMetadataPrefix,
  type SimS3SystemMetadataField,
  type SimS3SystemMetadataHeader,
} from "./s3-system-metadata.js";

/**
 * The field a read of an Object hands a system metadata header back in.
 *
 * The same names a write sets them with, apart from the expiry. The SDK reads
 * that header into `ExpiresString` and parses it into `Expires` alongside, so
 * the two are separate fields on the way out where they are one on the way in.
 */
export type SimS3SystemMetadataOutputField =
  | Exclude<SimS3SystemMetadataField, "Expires">
  | "ExpiresString";

/**
 * What a read of an Object says about it, beyond the bytes themselves.
 *
 * S3 answers a `GetObject` or a `HeadObject` with these as fields of their
 * own. They are what S3 knows about the Object. `Metadata` is what the caller
 * attached to it.
 */
export interface SimS3SystemMetadataOutput {
  readonly CacheControl?: string;
  readonly ContentDisposition?: string;
  readonly ContentEncoding?: string;
  readonly ContentLanguage?: string;
  readonly ContentType?: string;
  /** The expiry header, parsed as the SDK parses it. */
  readonly Expires?: Date;
  /** The expiry header as S3 stored it. */
  readonly ExpiresString?: string;
}

/**
 * Describe an Object's stored headers as the fields a read of it carries.
 *
 * A header the Object does not hold leaves its field absent rather than
 * present and undefined, so a caller can tell a header S3 has nothing to say
 * about from one it reports as empty.
 */
export function simS3SystemMetadataOutput(
  headers: Readonly<Record<string, string>>,
): SimS3SystemMetadataOutput {
  const output: SimS3MutableSystemMetadataOutput = {};

  for (const header of simS3SystemMetadataHeaders) {
    const value = headers[header.name];

    if (value !== undefined) {
      output[outputFieldOf(header)] = value;
    }
  }

  if (output.ExpiresString !== undefined) {
    output.Expires = new Date(output.ExpiresString);
  }

  return output;
}

/**
 * The headers to serve an Object with, from what a read of it answered.
 *
 * The endpoints that serve an Object read it through the ordinary GetObject
 * command, so what they build a response from is the read's own fields. This
 * puts them back under the header names the response carries.
 *
 * The values are checked on the way through, because a read output reaches
 * here loosely typed from the SDK-facing router (which has only the command
 * name to go on).
 */
export function simS3SystemMetadataHeadersFrom(
  output: Readonly<Partial<Record<SimS3SystemMetadataOutputField, unknown>>>,
): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const header of simS3SystemMetadataHeaders) {
    const value = output[outputFieldOf(header)];

    if (typeof value === "string") {
      headers[header.name] = value;
    }
  }

  return headers;
}

/**
 * The metadata a caller attached to an Object, under the keys it used.
 *
 * Stored under the `x-amz-meta-` prefix and answered without it, which is what
 * real S3 does with a read's `Metadata`. A key naming a header S3 sets itself
 * survives the round trip and stays out of the Object's own fields.
 */
export function simS3UserDefinedMetadata(
  headers: Readonly<Record<string, string>>,
): Record<string, string> {
  const metadata: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (key.startsWith(simS3UserMetadataPrefix)) {
      metadata[key.slice(simS3UserMetadataPrefix.length)] = value;
    }
  }

  return metadata;
}

/** The output field a stored header is reported in. */
function outputFieldOf(
  header: SimS3SystemMetadataHeader,
): SimS3SystemMetadataOutputField {
  if (header.field === "Expires") {
    return "ExpiresString";
  }

  return header.field;
}

/** The output being built, before it is handed out as read-only. */
type SimS3MutableSystemMetadataOutput = {
  -readonly [
    Field in keyof SimS3SystemMetadataOutput
  ]: SimS3SystemMetadataOutput[Field];
};
