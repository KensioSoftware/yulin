import type { SimS3SystemMetadataValues } from "./s3-system-metadata.js";

/**
 * Something that says what S3 reports about Objects it does not store.
 *
 * A stored Object carries its own system metadata, so this is for the Objects
 * that cannot: the ones a mounted directory maps onto files, which carry their
 * bytes and their names and nothing else. Whatever S3 was told about them is
 * declared instead, by whichever part of the simulated account knows it.
 *
 * A declaration says two things, because a mount serves the files a build
 * writes rather than the files something published. It knows which Objects it
 * described, and it knows the rule it described them by, and those answer
 * different questions: what is this Object, and what would this file have been.
 */
export interface SimS3SystemMetadataDeclaration {
  /** Whether this is what S3 holds about the Object under a key. */
  describes(objectKey: string): boolean;

  /**
   * Whether this is what S3 would hold about a file arriving under a key.
   *
   * A rule rather than a fact, so it answers for a page a rebuild added after
   * the last deployment ran.
   */
  wouldDescribe(objectKey: string): boolean;

  /** What it says S3 reports about them. */
  readonly metadata: SimS3SystemMetadataValues;
}

/**
 * Somewhere declarations are kept and can be read back.
 *
 * Named by the shape rather than the class, so storage laying a mount's
 * declarations over a Bucket's takes the Bucket as somewhere to read from
 * rather than as the Bucket.
 */
export interface SimS3SystemMetadataDeclarations {
  declarations(): readonly SimS3SystemMetadataDeclaration[];
}
