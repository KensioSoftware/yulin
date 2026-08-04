import { SimDynamoDbEventSourceStreamReader } from "./sim-dynamodb-event-source-stream-reader.js";
import { SimDynamoDbEventSourceStreamShard } from "./sim-dynamodb-event-source-stream-shard.js";
import type {
  SimLambdaEventSourceStreamActivity,
  SimLambdaEventSourceStreamService,
} from "./sim-lambda-event-source-stream-service.js";
import type {
  SimLambdaEventSourceStreamBatch,
  SimLambdaEventSourceStreamReadRequest,
  SimLambdaEventSourceStreamRequest,
  SimLambdaEventSourceStreams,
  SimLambdaEventSourceStreamWatcher,
} from "./sim-lambda-event-source-streams.js";

interface SimDynamoDbEventSourceStreamsProperties {
  readonly dynamoDb: SimLambdaEventSourceStreamService;
}

/**
 * Simulated DynamoDB as the streams a Lambda event source mapping polls.
 *
 * Every call goes through the DynamoDB Streams command it would go through on
 * real AWS, as the function's execution role, so a role without
 * `dynamodb:DescribeStream`, `dynamodb:GetShardIterator` or
 * `dynamodb:GetRecords` on the stream is refused here rather than quietly
 * polling anyway.
 */
export class SimDynamoDbEventSourceStreams implements SimLambdaEventSourceStreams {
  private readonly activity: SimLambdaEventSourceStreamActivity;
  private readonly shard: SimDynamoDbEventSourceStreamShard;
  private readonly reader: SimDynamoDbEventSourceStreamReader;

  constructor(properties: SimDynamoDbEventSourceStreamsProperties) {
    const { dynamoDb } = properties;
    const commands = dynamoDb.streams();

    this.activity = dynamoDb.streamActivity();
    this.shard = new SimDynamoDbEventSourceStreamShard(commands);
    this.reader = new SimDynamoDbEventSourceStreamReader({
      commands,
      shard: this.shard,
    });
  }

  /**
   * The table whose changes a stream carries.
   *
   * This is a DescribeStream call, which is also how a mapping finds out
   * whether the stream it names is there at all: real Lambda needs the same
   * permission for the same reason.
   */
  async tableName(request: SimLambdaEventSourceStreamRequest): Promise<string> {
    return await this.shard.tableName(request);
  }

  /**
   * Read up to a batch of records from where a position left off.
   */
  async read(
    request: SimLambdaEventSourceStreamReadRequest,
  ): Promise<SimLambdaEventSourceStreamBatch> {
    return await this.reader.read(request);
  }

  /**
   * Watch a stream for the records written to it.
   */
  watch(streamArn: string, watcher: SimLambdaEventSourceStreamWatcher): void {
    this.activity.watch(streamArn, watcher);
  }

  /**
   * Stop watching a stream.
   */
  unwatch(streamArn: string, watcher: SimLambdaEventSourceStreamWatcher): void {
    this.activity.unwatch(streamArn, watcher);
  }
}
