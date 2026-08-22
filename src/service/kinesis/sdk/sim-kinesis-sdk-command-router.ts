import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type * as simKinesisCommands from "../command/sim-kinesis-command.types.js";
import type { SimKinesis } from "../sim-kinesis.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated Kinesis.
 */
export class SimKinesisSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simKinesis: SimKinesis) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "CreateStreamCommand",
        async (command, context): Promise<unknown> =>
          await simKinesis.createStream(
            command as simKinesisCommands.SimCreateStreamCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteStreamCommand",
        async (command, context): Promise<unknown> =>
          await simKinesis.deleteStream(
            command as simKinesisCommands.SimDeleteStreamCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListStreamsCommand",
        async (command, context): Promise<unknown> =>
          await simKinesis.listStreams(
            command as simKinesisCommands.SimListStreamsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeStreamCommand",
        async (command, context): Promise<unknown> =>
          await simKinesis.describeStream(
            command as simKinesisCommands.SimDescribeStreamCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeStreamSummaryCommand",
        async (command, context): Promise<unknown> =>
          await simKinesis.describeStreamSummary(
            command as simKinesisCommands.SimDescribeStreamSummaryCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "IncreaseStreamRetentionPeriodCommand",
        async (command, context): Promise<unknown> =>
          await simKinesis.increaseStreamRetentionPeriod(
            command as simKinesisCommands.SimIncreaseStreamRetentionPeriodCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DecreaseStreamRetentionPeriodCommand",
        async (command, context): Promise<unknown> =>
          await simKinesis.decreaseStreamRetentionPeriod(
            command as simKinesisCommands.SimDecreaseStreamRetentionPeriodCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PutRecordCommand",
        async (command, context): Promise<unknown> =>
          await simKinesis.putRecord(
            command as simKinesisCommands.SimPutRecordCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PutRecordsCommand",
        async (command, context): Promise<unknown> =>
          await simKinesis.putRecords(
            command as simKinesisCommands.SimPutRecordsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetShardIteratorCommand",
        async (command, context): Promise<unknown> =>
          await simKinesis.getShardIterator(
            command as simKinesisCommands.SimGetShardIteratorCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetRecordsCommand",
        async (command, context): Promise<unknown> =>
          await simKinesis.getRecords(
            command as simKinesisCommands.SimGetRecordsCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated Kinesis can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated Kinesis supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
