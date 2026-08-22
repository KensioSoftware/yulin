import { SimFirehoseInvalidArgumentException } from "../error/sim-firehose.error.js";

const bytesPerMegabyte = 1024 * 1024;

const millisecondsPerSecond = 1000;

const defaultSizeInMegabytes = 5;

const minimumSizeInMegabytes = 1;

const maximumSizeInMegabytes = 128;

const defaultIntervalInSeconds = 300;

const minimumIntervalInSeconds = 0;

const maximumIntervalInSeconds = 900;

/**
 * How a request declares when a buffer should be delivered.
 */
export interface SimFirehoseBufferingHintsInput {
  readonly SizeInMBs?: number | undefined;
  readonly IntervalInSeconds?: number | undefined;
}

/**
 * When a delivery stream's buffer is delivered, in the two bounds Firehose
 * applies to every buffer.
 *
 * Whichever bound is reached first is what delivers the buffer. The size is
 * held in bytes and the interval in milliseconds, since those are the units the
 * buffer and the scheduler work in.
 */
export class SimFirehoseBufferingHints {
  public readonly sizeInMegabytes: number;
  public readonly intervalInSeconds: number;

  constructor(input: SimFirehoseBufferingHintsInput = {}) {
    this.sizeInMegabytes = requireInRange(
      "SizeInMBs",
      input.SizeInMBs ?? defaultSizeInMegabytes,
      minimumSizeInMegabytes,
      maximumSizeInMegabytes,
    );
    this.intervalInSeconds = requireInRange(
      "IntervalInSeconds",
      input.IntervalInSeconds ?? defaultIntervalInSeconds,
      minimumIntervalInSeconds,
      maximumIntervalInSeconds,
    );
  }

  /**
   * The buffer size that delivers, in bytes.
   */
  get sizeInBytes(): number {
    return this.sizeInMegabytes * bytesPerMegabyte;
  }

  /**
   * How long a buffer waits before it delivers, in milliseconds.
   */
  get intervalInMilliseconds(): number {
    return this.intervalInSeconds * millisecondsPerSecond;
  }
}

function requireInRange(
  field: string,
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new SimFirehoseInvalidArgumentException(
      `BufferingHints ${field} must be a whole number between ${String(minimum)} ` +
        `and ${String(maximum)}, and is ${String(value)}`,
    );
  }

  return value;
}
