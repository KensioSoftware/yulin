import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type * as simFirehoseCommands from "../command/sim-firehose-command.types.js";
import type { SimFirehose } from "../sim-firehose.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated Firehose.
 */
export class SimFirehoseSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simFirehose: SimFirehose) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "CreateDeliveryStreamCommand",
        async (command, context): Promise<unknown> =>
          await simFirehose.createDeliveryStream(
            command as simFirehoseCommands.SimCreateDeliveryStreamCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteDeliveryStreamCommand",
        async (command, context): Promise<unknown> =>
          await simFirehose.deleteDeliveryStream(
            command as simFirehoseCommands.SimDeleteDeliveryStreamCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListDeliveryStreamsCommand",
        async (command, context): Promise<unknown> =>
          await simFirehose.listDeliveryStreams(
            command as simFirehoseCommands.SimListDeliveryStreamsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeDeliveryStreamCommand",
        async (command, context): Promise<unknown> =>
          await simFirehose.describeDeliveryStream(
            command as simFirehoseCommands.SimDescribeDeliveryStreamCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PutRecordCommand",
        async (command, context): Promise<unknown> =>
          await simFirehose.putRecord(
            command as simFirehoseCommands.SimPutRecordCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PutRecordBatchCommand",
        async (command, context): Promise<unknown> =>
          await simFirehose.putRecordBatch(
            command as simFirehoseCommands.SimPutRecordBatchCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated Firehose can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated Firehose supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
