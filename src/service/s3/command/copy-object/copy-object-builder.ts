import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimS3Object } from "../../object/s3-object.js";
import type { SimS3ServerSideEncryption } from "../../object/s3-server-side-encryption.js";
import { simS3WriteMetadata } from "../../object/s3-write-metadata.js";
import {
  simS3WriteEncryption,
  simS3WriteStorageClass,
} from "../../object/s3-write-storage.js";
import type { SimCopyObjectCommandInput } from "./copy-object.command.js";

interface CopyObjectBuilderProperties {
  readonly clock: SimClock;
}

/**
 * Builds the Object a copy stores at its destination.
 *
 * The command handler owns validation, both Bucket lookups, both
 * authorizations and the write. This owns the one question of what the
 * destination Object is made of. That is the source's bytes, and either the
 * source's metadata or the request's.
 */
export class CopyObjectBuilder {
  private readonly clock: SimClock;

  constructor(properties: CopyObjectBuilderProperties) {
    this.clock = properties.clock;
  }

  /**
   * Build the destination Object from the source Object and the request.
   *
   * The bytes are copied into a Buffer of their own. Both Objects would
   * otherwise share one, and a Bucket backed by memory hands out the Buffer it
   * stores. A caller writing into the source's bytes would then change the
   * copy as well.
   *
   * The destination is dated by the simulation's clock, and it gets no ETag of
   * its own to carry. An Object uploaded in parts keeps the multipart ETag it
   * was given, and real S3 rewrites a copy of one as a single part. The copy's
   * ETag is therefore the plain digest of its bytes.
   *
   * The storage class and the encryption come from the request and the
   * destination Bucket. Real S3 stores a copy in the default class where the
   * request names none, whatever class the source was in.
   */
  build(
    input: SimCopyObjectCommandInput,
    key: string,
    source: SimS3Object,
    destinationEncryption: SimS3ServerSideEncryption,
  ): SimS3Object {
    const storageClass = simS3WriteStorageClass(input, "CopyObjectCommand");

    return new SimS3Object({
      key,
      body: Buffer.from(source.body),
      metadata:
        input.MetadataDirective === "REPLACE"
          ? simS3WriteMetadata(input)
          : source.metadata,
      lastModified: this.clock.now(),
      ...(storageClass !== undefined && { storageClass }),
      serverSideEncryption: simS3WriteEncryption(
        input,
        destinationEncryption,
        "CopyObjectCommand",
      ),
    });
  }
}
