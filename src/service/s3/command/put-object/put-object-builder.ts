import { SimS3Object, SimS3ObjectMetadata } from "../../object/s3-object.js";
import { simS3SystemMetadataHeaders } from "../../object/s3-system-metadata.js";
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
 *
 * The simulation currently supports the request body forms used by its S3
 * boundary: strings and Uint8Array values. Node.js Buffer values are also covered
 * because Buffer extends Uint8Array. Other SDK streaming body forms should be
 * added here when the simulation gains support for them.
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
      body: this.toBuffer(command.input.Body),
      metadata: new SimS3ObjectMetadata(this.toMetadata(command)),
      lastModified: this.clock.now(),
    });
  }

  /**
   * Convert SDK metadata fields to the string map stored by SimS3ObjectMetadata.
   *
   * User-defined metadata is retained as supplied. System metadata is read by
   * the same list of headers a read returns, under the lowercase key that read
   * looks the value up by, so a write and a read agree on what S3 remembers
   * about an Object. An omitted header leaves its key absent rather than
   * assigning an undefined value.
   */
  private toMetadata(command: SimPutObjectCommand): Record<string, string> {
    const metadata: Record<string, string> = { ...command.input.Metadata };

    for (const header of simS3SystemMetadataHeaders) {
      const value = this.toMetadataValue(command.input[header.field]);

      if (value !== undefined) {
        metadata[header.name] = value;
      }
    }

    return metadata;
  }

  /**
   * Represent a system metadata value as the string S3 stores and returns.
   *
   * Only `Expires` arrives as a Date, which the SDK would otherwise format on
   * the wire. It becomes the same HTTP date here so the read side has a header
   * value to hand back rather than an object.
   */
  private toMetadataValue(
    value: string | Date | undefined,
  ): string | undefined {
    if (value instanceof Date) {
      return value.toUTCString();
    }

    return value;
  }

  /**
   * Materialize a supported SDK request body as a Buffer for Bucket storage.
   *
   * An omitted body represents an empty S3 Object. Strings use Node.js's default
   * UTF-8 encoding. Uint8Array input is copied into a Buffer so storage receives
   * one consistent binary representation and does not depend on the caller's
   * mutable typed-array instance.
   */
  private toBuffer(body: SimPutObjectCommand["input"]["Body"]): Buffer {
    if (body === undefined) {
      return Buffer.alloc(0);
    }

    if (typeof body === "string") {
      return Buffer.from(body);
    }

    if (body instanceof Uint8Array) {
      return Buffer.from(body);
    }

    throw new Error(
      "PutObjectCommand.input.Body must be a string or Uint8Array",
    );
  }
}
