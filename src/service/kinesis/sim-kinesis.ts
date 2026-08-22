import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import type * as simKinesisCommands from "./command/sim-kinesis-command.types.js";
import { SimKinesisCommands } from "./command/sim-kinesis-commands.js";
import type { SimKinesisRequestOptions } from "./command/sim-kinesis-request-options.js";
import { SimKinesisSdkCommandRouter } from "./sdk/sim-kinesis-sdk-command-router.js";
import type { SimKinesisStream } from "./stream/sim-kinesis-stream.js";
import { SimKinesisStreamStore } from "./stream/sim-kinesis-stream-store.js";

interface SimKinesisProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated Kinesis Data Streams. Handles SDK commands. Emulates AWS behaviour
 * and state.
 *
 * Streams are scoped to an account and region, as they are on real AWS. A
 * stream name is unique within one of those scopes, and the ARN a request
 * reaches a stream by names the region.
 *
 * A stream's shards are opened when it is created and stay as they are. A
 * record goes to the shard whose slice of the hash key space its partition key
 * hashes into, which is how real Kinesis places one, and nothing here splits or
 * merges a shard afterwards.
 *
 * Enhanced fan-out is unsimulated. A consumer reads through `GetRecords`, which
 * is the shared throughput path every stream has.
 */
export class SimKinesis {
  private readonly streams = new SimKinesisStreamStore();
  private readonly commands: SimKinesisCommands;
  private readonly background: BackgroundScheduler;
  private readonly sdkRouter = new SimKinesisSdkCommandRouter(this);

  constructor(properties: SimKinesisProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.background = background;
    this.commands = new SimKinesisCommands({
      streams: this.streams,
      iam,
      background,
      accountRegionScope,
    });
  }

  /**
   * Find a stream by name.
   *
   * This is the simulator's own accessor, for tests seeding or inspecting
   * stream state without going through a Command and its authorization.
   */
  findStream(name: string): SimKinesisStream | undefined {
    return this.streams.find(name);
  }

  /** Handle a CreateStream Command from the SDK. */
  async createStream(
    command: simKinesisCommands.SimCreateStreamCommand,
    options?: SimKinesisRequestOptions,
  ): Promise<simKinesisCommands.SimCreateStreamCommandOutput> {
    await this.background.sequence();
    return this.commands.streamCreation.handle(command, options);
  }

  /** Handle a DeleteStream Command from the SDK. */
  async deleteStream(
    command: simKinesisCommands.SimDeleteStreamCommand,
    options?: SimKinesisRequestOptions,
  ): Promise<simKinesisCommands.SimDeleteStreamCommandOutput> {
    await this.background.sequence();
    return this.commands.streams.deleteStream(command, options);
  }

  /** Handle a ListStreams Command from the SDK. */
  async listStreams(
    command: simKinesisCommands.SimListStreamsCommand,
    options?: SimKinesisRequestOptions,
  ): Promise<simKinesisCommands.SimListStreamsCommandOutput> {
    await this.background.sequence();
    return this.commands.streams.listStreams(command, options);
  }

  /** Handle a DescribeStream Command from the SDK. */
  async describeStream(
    command: simKinesisCommands.SimDescribeStreamCommand,
    options?: SimKinesisRequestOptions,
  ): Promise<simKinesisCommands.SimDescribeStreamCommandOutput> {
    await this.background.sequence();
    return this.commands.streams.describeStream(command, options);
  }

  /** Handle a DescribeStreamSummary Command from the SDK. */
  async describeStreamSummary(
    command: simKinesisCommands.SimDescribeStreamSummaryCommand,
    options?: SimKinesisRequestOptions,
  ): Promise<simKinesisCommands.SimDescribeStreamSummaryCommandOutput> {
    await this.background.sequence();
    return this.commands.streams.describeStreamSummary(command, options);
  }

  /** Handle a PutRecord Command from the SDK. */
  async putRecord(
    command: simKinesisCommands.SimPutRecordCommand,
    options?: SimKinesisRequestOptions,
  ): Promise<simKinesisCommands.SimPutRecordCommandOutput> {
    await this.background.sequence();
    return this.commands.puts.putRecord(command, options);
  }

  /** Handle a PutRecords Command from the SDK. */
  async putRecords(
    command: simKinesisCommands.SimPutRecordsCommand,
    options?: SimKinesisRequestOptions,
  ): Promise<simKinesisCommands.SimPutRecordsCommandOutput> {
    await this.background.sequence();
    return this.commands.puts.putRecords(command, options);
  }

  /** Handle a GetShardIterator Command from the SDK. */
  async getShardIterator(
    command: simKinesisCommands.SimGetShardIteratorCommand,
    options?: SimKinesisRequestOptions,
  ): Promise<simKinesisCommands.SimGetShardIteratorCommandOutput> {
    await this.background.sequence();
    return this.commands.reads.getShardIterator(command, options);
  }

  /** Handle a GetRecords Command from the SDK. */
  async getRecords(
    command: simKinesisCommands.SimGetRecordsCommand,
    options?: SimKinesisRequestOptions,
  ): Promise<simKinesisCommands.SimGetRecordsCommandOutput> {
    await this.background.sequence();
    return this.commands.reads.getRecords(command, options);
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
