import {
  simS3SystemMetadataHeaders,
  type SimS3SystemMetadataField,
} from "./s3-system-metadata.js";

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
 * System metadata declared for the Objects under one key prefix.
 */
export interface SimS3KeyPrefixMetadata {
  /**
   * The Object key prefix this applies to, such as `br/`. An empty prefix
   * applies to every Object.
   */
  readonly keyPrefix: string;

  /** What S3 reports about the Objects under that prefix. */
  readonly metadata: SimS3SystemMetadataValues;
}

interface SimS3KeyPrefixSystemMetadataProperties {
  readonly declarations?: readonly SimS3KeyPrefixMetadata[] | undefined;
}

/**
 * The system metadata declared for an Object key by the prefixes it starts
 * with.
 *
 * Storage that holds an Object holds its metadata with it, so nothing needs
 * this. Storage that maps Objects onto files has only the file to go on, and a
 * file carries its bytes and its name and nothing else, so anything S3 would
 * have been told at upload time has to be declared instead. `Content-Encoding`
 * is the one that stops a site working without it: a directory of brotli files
 * served without the header is bytes no browser can decode.
 */
export class SimS3KeyPrefixSystemMetadata {
  private readonly declarations: readonly SimS3KeyPrefixMetadata[];

  constructor(properties: SimS3KeyPrefixSystemMetadataProperties = {}) {
    this.declarations = properties.declarations ?? [];
  }

  /**
   * The headers declared for one Object key, under the names a read returns
   * them by.
   *
   * Every declaration whose prefix the key starts with applies, in the order
   * they were given, so a later one wins where two name the same header.
   */
  headersForObjectKey(key: string): Record<string, string> {
    const headers: Record<string, string> = {};

    for (const declaration of this.declarations) {
      if (key.startsWith(declaration.keyPrefix)) {
        this.addDeclared(headers, declaration);
      }
    }

    return headers;
  }

  private addDeclared(
    headers: Record<string, string>,
    declaration: SimS3KeyPrefixMetadata,
  ): void {
    for (const header of simS3SystemMetadataHeaders) {
      const value = declaration.metadata[header.field];

      if (value !== undefined) {
        headers[header.name] = value;
      }
    }
  }
}
