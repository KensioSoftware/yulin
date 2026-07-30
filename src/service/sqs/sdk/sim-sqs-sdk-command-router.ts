import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type {
  SimChangeMessageVisibilityCommand,
  SimDeleteMessageBatchCommand,
  SimDeleteMessageCommand,
} from "../command/message/consume.command.js";
import type { SimReceiveMessageCommand } from "../command/message/receive.command.js";
import type {
  SimSendMessageBatchCommand,
  SimSendMessageCommand,
} from "../command/message/send.command.js";
import type {
  SimCreateQueueCommand,
  SimDeleteQueueCommand,
  SimGetQueueAttributesCommand,
  SimGetQueueUrlCommand,
  SimListQueuesCommand,
  SimPurgeQueueCommand,
  SimSetQueueAttributesCommand,
} from "../command/queue/queue.command.js";
import type { SimSqs } from "../sim-sqs.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated SQS.
 */
export class SimSqsSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simSqs: SimSqs) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "CreateQueueCommand",
        async (command, context): Promise<unknown> =>
          await simSqs.createQueue(
            command as SimCreateQueueCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetQueueUrlCommand",
        async (command, context): Promise<unknown> =>
          await simSqs.getQueueUrl(
            command as SimGetQueueUrlCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListQueuesCommand",
        async (command, context): Promise<unknown> =>
          await simSqs.listQueues(
            command as SimListQueuesCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteQueueCommand",
        async (command, context): Promise<unknown> =>
          await simSqs.deleteQueue(
            command as SimDeleteQueueCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetQueueAttributesCommand",
        async (command, context): Promise<unknown> =>
          await simSqs.getQueueAttributes(
            command as SimGetQueueAttributesCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "SetQueueAttributesCommand",
        async (command, context): Promise<unknown> =>
          await simSqs.setQueueAttributes(
            command as SimSetQueueAttributesCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PurgeQueueCommand",
        async (command, context): Promise<unknown> =>
          await simSqs.purgeQueue(
            command as SimPurgeQueueCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "SendMessageCommand",
        async (command, context): Promise<unknown> =>
          await simSqs.sendMessage(
            command as SimSendMessageCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "SendMessageBatchCommand",
        async (command, context): Promise<unknown> =>
          await simSqs.sendMessageBatch(
            command as SimSendMessageBatchCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ReceiveMessageCommand",
        async (command, context): Promise<unknown> =>
          await simSqs.receiveMessage(
            command as SimReceiveMessageCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteMessageCommand",
        async (command, context): Promise<unknown> =>
          await simSqs.deleteMessage(
            command as SimDeleteMessageCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteMessageBatchCommand",
        async (command, context): Promise<unknown> =>
          await simSqs.deleteMessageBatch(
            command as SimDeleteMessageBatchCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ChangeMessageVisibilityCommand",
        async (command, context): Promise<unknown> =>
          await simSqs.changeMessageVisibility(
            command as SimChangeMessageVisibilityCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated SQS can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated SQS supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
