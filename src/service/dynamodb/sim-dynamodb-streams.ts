import type { BackgroundScheduler } from "../../util/background/background.js";
import type { SimSdkCommandRouter } from "../../sdk/index.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimDynamoDbAuthorizer } from "./command/authorize/sim-dynamodb-authorizer.js";
import type * as simStreamCommands from "./command/stream/sim-dynamodb-stream-command.types.js";
import { SimDynamoDbDescribeStream } from "./command/stream/describe-stream/sim-dynamodb-describe-stream.js";
import { SimDynamoDbGetRecords } from "./command/stream/get-records/sim-dynamodb-get-records.js";
import { SimDynamoDbGetShardIterator } from "./command/stream/get-shard-iterator/sim-dynamodb-get-shard-iterator.js";
import { SimDynamoDbListStreams } from "./command/stream/list-streams/sim-dynamodb-list-streams.js";
import { SimDynamoDbStreamAccess } from "./command/stream/sim-dynamodb-stream-access.js";
import { SimDynamoDbStreamsSdkCommandRouter } from "./sdk/sim-dynamodb-streams-sdk-command-router.js";
import type { SimDynamoDbStreamStore } from "./stream/sim-dynamodb-stream-store.js";
import type { SimDynamoDbRequestOptions } from "./sim-dynamodb.types.js";

/**
 * What one simulated DynamoDB Streams is built with.
 *
 * It is never built alone. The streams it reads are the ones the tables of one
 * simulated DynamoDB captured onto, so the store comes from there rather than
 * being made here.
 */
export interface SimDynamoDbStreamsProperties {
  readonly streams: SimDynamoDbStreamStore;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
}

/**
 * Simulated DynamoDB Streams. Handles SDK commands from the separate DynamoDB
 * Streams client.
 *
 * This is a second API over one simulated DynamoDB's state rather than a
 * service of its own, which is what AWS has too: the streams here are the ones
 * this Account and Region's tables captured onto, and a stream ARN is a table
 * ARN with a label after it.
 *
 * It is deliberately shaped as SDK commands rather than as a Yulin accessor,
 * even though nobody writes GetRecords loops in application code. A Lambda
 * event source mapping polling a stream has to authorize as its execution role
 * through the same path a user's own call takes, so a bespoke internal read
 * interface would be GetRecords under another name plus a second thing to
 * learn. It is also the only way a failing delivery test can tell "nothing was
 * captured" from "the poller did not deliver".
 */
export class SimDynamoDbStreams {
  private readonly background: BackgroundScheduler;
  private readonly streamListing: SimDynamoDbListStreams;
  private readonly streamDescriptions: SimDynamoDbDescribeStream;
  private readonly shardIterators: SimDynamoDbGetShardIterator;
  private readonly recordReads: SimDynamoDbGetRecords;
  private readonly sdkRouter = new SimDynamoDbStreamsSdkCommandRouter(this);

  constructor(properties: SimDynamoDbStreamsProperties) {
    const { accountRegionScope, background } = properties;
    const access = new SimDynamoDbStreamAccess({
      streams: properties.streams,
      authorizer: new SimDynamoDbAuthorizer({
        iam: properties.iam,
        accountRegionScope,
      }),
      clock: background,
    });

    this.background = background;
    this.streamListing = new SimDynamoDbListStreams({ access });
    this.streamDescriptions = new SimDynamoDbDescribeStream({ access });
    this.shardIterators = new SimDynamoDbGetShardIterator({ access });
    this.recordReads = new SimDynamoDbGetRecords({
      access,
      accountRegionScope,
    });
  }

  /** Handle a List Streams Command from the SDK. */
  async listStreams(
    command: simStreamCommands.SimListStreamsCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<simStreamCommands.SimListStreamsCommandOutput> {
    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();
    return this.streamListing.handle(command, options);
  }

  /** Handle a Describe Stream Command from the SDK. */
  async describeStream(
    command: simStreamCommands.SimDescribeStreamCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<simStreamCommands.SimDescribeStreamCommandOutput> {
    await this.background.sequence();
    return this.streamDescriptions.handle(command, options);
  }

  /** Handle a Get Shard Iterator Command from the SDK. */
  async getShardIterator(
    command: simStreamCommands.SimGetShardIteratorCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<simStreamCommands.SimGetShardIteratorCommandOutput> {
    await this.background.sequence();
    return this.shardIterators.handle(command, options);
  }

  /** Handle a Get Records Command from the SDK. */
  async getRecords(
    command: simStreamCommands.SimGetRecordsCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<simStreamCommands.SimGetRecordsCommandOutput> {
    await this.background.sequence();
    return this.recordReads.handle(command, options);
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
