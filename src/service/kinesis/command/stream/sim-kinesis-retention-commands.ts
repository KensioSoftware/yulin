import { SimKinesisInvalidArgumentException } from "../../error/sim-kinesis.error.js";
import { simKinesisRetentionHours } from "../../stream/sim-kinesis-retention.js";
import type { SimKinesisStream } from "../../stream/sim-kinesis-stream.js";
import type { SimKinesisRequestOptions } from "../sim-kinesis-request-options.js";
import type { SimKinesisStreamAccess } from "../sim-kinesis-stream-access.js";
import type {
  SimDecreaseStreamRetentionPeriodCommand,
  SimIncreaseStreamRetentionPeriodCommand,
  SimStreamRetentionPeriodCommandOutput,
} from "./stream.command.js";

interface SimKinesisRetentionCommandsProperties {
  readonly access: SimKinesisStreamAccess;
}

/**
 * The commands that move how long a stream keeps a record.
 *
 * They are two commands rather than one because real Kinesis refuses the wrong
 * direction: increasing to less than the stream already keeps, or decreasing to
 * more, is a mistake about what the caller believed the stream was set to.
 */
export class SimKinesisRetentionCommands {
  private readonly access: SimKinesisStreamAccess;

  constructor(properties: SimKinesisRetentionCommandsProperties) {
    this.access = properties.access;
  }

  /**
   * Keep records for longer than the stream keeps them now.
   */
  increase(
    command: SimIncreaseStreamRetentionPeriodCommand,
    options?: SimKinesisRequestOptions,
  ): SimStreamRetentionPeriodCommandOutput {
    const { input } = command;
    const stream = this.access.require(
      "kinesis:IncreaseStreamRetentionPeriod",
      input,
      options,
    );
    const hours = requiredHours(input.RetentionPeriodHours);

    assertDirection(stream, hours, "increase");
    stream.setRetentionHours(hours);

    return { $metadata: {} };
  }

  /**
   * Keep records for less time than the stream keeps them now.
   *
   * A record already older than the new window is gone from the next read,
   * since retention is applied when a stream is read.
   */
  decrease(
    command: SimDecreaseStreamRetentionPeriodCommand,
    options?: SimKinesisRequestOptions,
  ): SimStreamRetentionPeriodCommandOutput {
    const { input } = command;
    const stream = this.access.require(
      "kinesis:DecreaseStreamRetentionPeriod",
      input,
      options,
    );
    const hours = requiredHours(input.RetentionPeriodHours);

    assertDirection(stream, hours, "decrease");
    stream.setRetentionHours(hours);

    return { $metadata: {} };
  }
}

/**
 * The retention a request has to carry, in the range Kinesis accepts.
 */
function requiredHours(hours: number | undefined): number {
  if (hours === undefined) {
    throw new SimKinesisInvalidArgumentException(
      "RetentionPeriodHours is required to change how long a stream keeps a " +
        "record",
    );
  }

  return simKinesisRetentionHours(hours);
}

/**
 * Refuse a change that does not go the way the command asking for it goes.
 *
 * Real Kinesis wants the new period to be strictly more for an increase and
 * strictly less for a decrease, so asking for what the stream already keeps is
 * refused as well. A caller doing that has the wrong idea of what the stream is
 * set to, which is the mistake both commands exist to catch.
 */
function assertDirection(
  stream: SimKinesisStream,
  hours: number,
  direction: "increase" | "decrease",
): void {
  const held = stream.retentionHours;
  const wrongWay = direction === "increase" ? hours <= held : hours >= held;

  if (wrongWay) {
    throw new SimKinesisInvalidArgumentException(
      `Cannot ${direction} the retention of stream ${stream.name} from ` +
        `${held} hours to ${hours}`,
    );
  }
}
