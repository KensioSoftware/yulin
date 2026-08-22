import { SimKinesisInvalidArgumentException } from "../error/sim-kinesis.error.js";

/**
 * The longest stream name real Kinesis accepts.
 */
const maxStreamNameLength = 128;

/**
 * The characters a stream name may be made of.
 */
const streamNamePattern = /^[a-zA-Z0-9_.-]+$/u;

/**
 * The name of one simulated Kinesis stream.
 *
 * A name is unique within one Account and Region, and it is the resource part
 * of the stream's ARN. Branding it keeps a raw string from reaching the store
 * without having been through the validation real Kinesis applies first.
 */
export class SimKinesisStreamName {
  public readonly value: string;

  constructor(value: string | undefined) {
    if (value === undefined || value === "") {
      throw new SimKinesisInvalidArgumentException(
        "StreamName is required and may not be empty",
      );
    }

    if (value.length > maxStreamNameLength) {
      throw new SimKinesisInvalidArgumentException(
        `StreamName '${value}' is longer than the ${maxStreamNameLength} ` +
          `characters Kinesis accepts`,
      );
    }

    if (!streamNamePattern.test(value)) {
      throw new SimKinesisInvalidArgumentException(
        `StreamName '${value}' may hold only letters, digits, underscores, ` +
          `hyphens and full stops`,
      );
    }

    this.value = value;
  }
}
