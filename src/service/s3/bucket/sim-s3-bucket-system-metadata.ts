import type {
  SimS3SystemMetadataDeclaration,
  SimS3SystemMetadataDeclarations,
} from "../object/s3-system-metadata-declaration.type.js";

/**
 * What a Bucket has been told about the Objects under its keys, apart from the
 * Objects themselves.
 *
 * A write says what S3 holds about the one Object it writes, and the Object
 * keeps it. This is the standing statement behind that: a CDK
 * `BucketDeployment` publishes files under a prefix with a set of headers, and
 * says so here as well as setting them, so that storage which cannot hold
 * metadata still knows what the Bucket serves those Objects with.
 *
 * Declarations are kept by source rather than appended, because a Stack
 * deployed twice in a watching dev process is the same deployment saying the
 * same thing again, and a redeployment that changed its headers is that
 * deployment saying something else rather than a second one disagreeing with
 * it. Re-declaring keeps the place in the order the first one took, so a later
 * deployment still wins where two describe the same Object.
 */
export class SimS3BucketSystemMetadata implements SimS3SystemMetadataDeclarations {
  private readonly declared = new Map<string, SimS3SystemMetadataDeclaration>();

  /**
   * Record what something publishing into this Bucket reports about the
   * Objects it publishes.
   */
  declare(source: string, declaration: SimS3SystemMetadataDeclaration): void {
    this.declared.set(source, declaration);
  }

  /** Everything the Bucket has been told, in the order it was first told. */
  declarations(): readonly SimS3SystemMetadataDeclaration[] {
    return this.declared.values().toArray();
  }
}
