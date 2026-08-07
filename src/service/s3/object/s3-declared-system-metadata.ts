import {
  SimS3KeyPrefixDeclaration,
  type SimS3KeyPrefixMetadata,
} from "./s3-key-prefix-metadata.js";
import type {
  SimS3SystemMetadataDeclaration,
  SimS3SystemMetadataDeclarations,
} from "./s3-system-metadata-declaration.type.js";
import {
  simS3SystemMetadataHeaders,
  type SimS3SystemMetadataValues,
} from "./s3-system-metadata.js";

interface SimS3DeclaredSystemMetadataProperties {
  /**
   * What the Bucket was already told about its Objects, which is where a CDK
   * `BucketDeployment` into the same Bucket has left the headers it publishes.
   */
  readonly inherited?: SimS3SystemMetadataDeclarations | undefined;

  /** What the mount declares itself, for the Objects under a key prefix. */
  readonly declarations?: readonly SimS3KeyPrefixMetadata[] | undefined;
}

/**
 * The system metadata declared for an Object key by everything that describes
 * it.
 *
 * Storage that holds an Object holds its metadata with it, so nothing needs
 * this. Storage that maps Objects onto files has only the file to go on, and a
 * file carries its bytes and its name and nothing else, so anything S3 would
 * have been told at upload time has to be declared instead. `Content-Encoding`
 * is the one that stops a site working without it: a directory of brotli files
 * served without the header is bytes no browser can decode.
 *
 * What the Bucket was told comes first and what the mount declares goes over
 * the top, so a mount serving the files a deployment publishes answers as the
 * deployment did without restating any of it, and still has the last word
 * where it wants a different answer locally.
 */
export class SimS3DeclaredSystemMetadata {
  private readonly inherited: SimS3SystemMetadataDeclarations | undefined;
  private readonly declared: readonly SimS3SystemMetadataDeclaration[];

  constructor(properties: SimS3DeclaredSystemMetadataProperties = {}) {
    this.inherited = properties.inherited;
    this.declared = (properties.declarations ?? []).map(
      (declaration) => new SimS3KeyPrefixDeclaration(declaration),
    );
  }

  /**
   * The headers declared for one Object key, under the names a read returns
   * them by.
   *
   * Every declaration that describes the key applies, in the order they were
   * made, so a later one wins where two name the same header.
   */
  headersForObjectKey(key: string): Record<string, string> {
    const headers: Record<string, string> = {};

    for (const declaration of this.describing(key)) {
      this.addDeclared(headers, declaration.metadata);
    }

    return headers;
  }

  /**
   * The declarations about one key, inherited ones first.
   */
  private describing(key: string): readonly SimS3SystemMetadataDeclaration[] {
    return [
      ...this.inheritedFor(key),
      ...this.declared.filter((declaration) => declaration.describes(key)),
    ];
  }

  /**
   * What the Bucket has to say about one key.
   *
   * The declarations it holds are read on every lookup rather than copied when
   * the mount is set up, because the two happen in either order: a dev script
   * mounts a directory into a Bucket and deploys the Stack that describes it
   * afterwards as readily as before, and an inheritance that only worked one
   * way round would be a worse trap than restating the headers by hand.
   *
   * What was published wins outright. Everything else is a guess about a file
   * that was not there when the Bucket was last filled, and a guess is only
   * taken where one declaration makes it: two deployments can publish into the
   * same prefix with different headers, and serving a page as the other one's
   * brotli would break it in a way declaring nothing does not.
   */
  private inheritedFor(key: string): readonly SimS3SystemMetadataDeclaration[] {
    const inherited = this.inherited?.declarations() ?? [];
    const describing = inherited.filter((declaration) =>
      declaration.describes(key),
    );

    if (describing.length > 0) {
      return describing;
    }

    const wouldDescribe = inherited.filter((declaration) =>
      declaration.wouldDescribe(key),
    );

    return wouldDescribe.length === 1 ? wouldDescribe : [];
  }

  private addDeclared(
    headers: Record<string, string>,
    declared: SimS3SystemMetadataValues,
  ): void {
    for (const header of simS3SystemMetadataHeaders) {
      const value = declared[header.field];

      if (value !== undefined) {
        headers[header.name] = value;
      }
    }
  }
}
