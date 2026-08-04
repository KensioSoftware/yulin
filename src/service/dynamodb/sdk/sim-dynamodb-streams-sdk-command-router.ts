import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type { SimDescribeStreamCommand } from "../command/stream/describe-stream/describe-stream.command.js";
import type { SimGetRecordsCommand } from "../command/stream/get-records/get-records.command.js";
import type { SimGetShardIteratorCommand } from "../command/stream/get-shard-iterator/get-shard-iterator.command.js";
import type { SimListStreamsCommand } from "../command/stream/list-streams/list-streams.command.js";
import type { SimDynamoDbStreams } from "../sim-dynamodb-streams.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated DynamoDB Streams.
 *
 * A second router rather than more entries on the DynamoDB one, because
 * `@aws-sdk/client-dynamodb-streams` is a client of its own with a service
 * identity of its own. Interception resolves the router from that identity, so
 * a Streams client reaches this and a DynamoDB client cannot.
 */
export class SimDynamoDbStreamsSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simDynamoDbStreams: SimDynamoDbStreams) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "ListStreamsCommand",
        async (command, context): Promise<unknown> =>
          await simDynamoDbStreams.listStreams(
            command as SimListStreamsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeStreamCommand",
        async (command, context): Promise<unknown> =>
          await simDynamoDbStreams.describeStream(
            command as SimDescribeStreamCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetShardIteratorCommand",
        async (command, context): Promise<unknown> =>
          await simDynamoDbStreams.getShardIterator(
            command as SimGetShardIteratorCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetRecordsCommand",
        async (command, context): Promise<unknown> =>
          await simDynamoDbStreams.getRecords(
            command as SimGetRecordsCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated DynamoDB Streams can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated DynamoDB Streams
   * supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
