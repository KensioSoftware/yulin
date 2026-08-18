import { SimS3Object } from "../../object/s3-object.js";
import { simS3WriteBodyBuffer } from "../../object/s3-write-body.js";
import { simS3WriteMetadata } from "../../object/s3-write-metadata.js";
import type { SimPutObjectCommand } from "./put-object.command.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimClock } from "../../../../util/clock/sim-clock.js";

interface PutObjectBuilderProperties {
  readonly clock: SimClock;
}

/**
 * Converts the supported PutObject request fields into a stored sim S3 Object.
 *
 * The command handler coordinates validation, Bucket lookup, authorization, and
 * storage. This builder owns the separate translation between the AWS SDK request
 * representation and the simulation's storage representation. Keeping that
 * translation here prevents body-format and metadata-normalization rules from
 * increasing the command handler's control-flow complexity.
 */
export class PutObjectBuilder {
  private readonly clock: SimClock;

  constructor(properties: PutObjectBuilderProperties) {
    this.clock = properties.clock;
  }

  /**
   * Build the Object that will be written to Bucket storage.
   *
   * This method performs conversion only. Callers must complete request
   * validation and authorization before invoking it so failed authorization
   * cannot trigger body processing or lead to storage mutation.
   *
   * The Object is dated by the simulation's clock rather than the host's, so a
   * test that freezes time gets a last-modified time it can assert on.
   */
  build(command: SimPutObjectCommand): SimS3Object {
    assertDefined(command.input.Key, "PutObjectCommand.input.Key");
    return new SimS3Object({
      key: command.input.Key,
      body: simS3WriteBodyBuffer(command.input.Body, "PutObjectCommand"),
      metadata: simS3WriteMetadata(command.input),
      lastModified: this.clock.now(),
    });
  }
}
