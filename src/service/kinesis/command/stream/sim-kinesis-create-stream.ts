import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimKinesisResourceInUseException } from "../../error/sim-kinesis.error.js";
import { simKinesisDefaultRetentionHours } from "../../stream/sim-kinesis-retention.js";
import { SimKinesisStream } from "../../stream/sim-kinesis-stream.js";
import {
  simKinesisCreatedShardCount,
  simKinesisStreamModeOf,
} from "../../stream/sim-kinesis-stream-mode.js";
import { SimKinesisStreamName } from "../../stream/sim-kinesis-stream-name.js";
import type { SimKinesisStreamStore } from "../../stream/sim-kinesis-stream-store.js";
import type { SimKinesisRequestOptions } from "../sim-kinesis-request-options.js";
import type { SimKinesisStreamAccess } from "../sim-kinesis-stream-access.js";
import type {
  SimCreateStreamCommand,
  SimCreateStreamCommandOutput,
} from "./stream.command.js";

interface SimKinesisCreateStreamProperties {
  readonly streams: SimKinesisStreamStore;
  readonly access: SimKinesisStreamAccess;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly background: BackgroundScheduler;
}

/**
 * The command that creates a stream.
 */
export class SimKinesisCreateStream {
  private readonly streams: SimKinesisStreamStore;
  private readonly access: SimKinesisStreamAccess;
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly background: BackgroundScheduler;

  constructor(properties: SimKinesisCreateStreamProperties) {
    this.streams = properties.streams;
    this.access = properties.access;
    this.accountRegionScope = properties.accountRegionScope;
    this.background = properties.background;
  }

  /**
   * Create a stream and open the shards it was asked for.
   *
   * A name this scope already holds is refused, as real Kinesis refuses it,
   * rather than answering with the stream that is there. The stream is `ACTIVE`
   * straight away: real Kinesis reports `CREATING` while it brings the shards
   * up, and a status a test has to poll through earns nothing when there are no
   * shards to bring up.
   *
   * Tags are kept on the stream. No command here reads them back, since the tag
   * operations are unsimulated, and a test that cares reads them through the
   * simulator's own accessor.
   */
  handle(
    command: SimCreateStreamCommand,
    options?: SimKinesisRequestOptions,
  ): SimCreateStreamCommandOutput {
    const { input } = command;
    const name = new SimKinesisStreamName(input.StreamName);

    this.access.authorizeName("kinesis:CreateStream", name.value, options);

    if (this.streams.find(name.value) !== undefined) {
      throw new SimKinesisResourceInUseException(
        `Stream ${name.value} under this account and region already exists`,
      );
    }

    const mode = simKinesisStreamModeOf(input.StreamModeDetails?.StreamMode);

    this.streams.add(
      new SimKinesisStream({
        name,
        accountRegionScope: this.accountRegionScope,
        mode,
        shardCount: simKinesisCreatedShardCount(mode, input.ShardCount),
        retentionHours: simKinesisDefaultRetentionHours,
        createdAt: this.background.now(),
        tags: input.Tags ?? {},
      }),
    );

    return { $metadata: {} };
  }
}
