import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type {
  SimPublishBatchCommand,
  SimPublishCommand,
} from "../command/publish/publish.command.js";
import type {
  SimGetSubscriptionAttributesCommand,
  SimListSubscriptionsByTopicCommand,
  SimListSubscriptionsCommand,
  SimSetSubscriptionAttributesCommand,
  SimSubscribeCommand,
  SimUnsubscribeCommand,
} from "../command/subscription/subscription.command.js";
import type {
  SimCreateTopicCommand,
  SimDeleteTopicCommand,
  SimGetTopicAttributesCommand,
  SimListTopicsCommand,
  SimSetTopicAttributesCommand,
} from "../command/topic/topic.command.js";
import type { SimSns } from "../sim-sns.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated SNS.
 */
export class SimSnsSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simSns: SimSns) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "CreateTopicCommand",
        async (command, context): Promise<unknown> =>
          await simSns.createTopic(
            command as SimCreateTopicCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListTopicsCommand",
        async (command, context): Promise<unknown> =>
          await simSns.listTopics(
            command as SimListTopicsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteTopicCommand",
        async (command, context): Promise<unknown> =>
          await simSns.deleteTopic(
            command as SimDeleteTopicCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetTopicAttributesCommand",
        async (command, context): Promise<unknown> =>
          await simSns.getTopicAttributes(
            command as SimGetTopicAttributesCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "SetTopicAttributesCommand",
        async (command, context): Promise<unknown> =>
          await simSns.setTopicAttributes(
            command as SimSetTopicAttributesCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "SubscribeCommand",
        async (command, context): Promise<unknown> =>
          await simSns.subscribe(
            command as SimSubscribeCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "UnsubscribeCommand",
        async (command, context): Promise<unknown> =>
          await simSns.unsubscribe(
            command as SimUnsubscribeCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListSubscriptionsCommand",
        async (command, context): Promise<unknown> =>
          await simSns.listSubscriptions(
            command as SimListSubscriptionsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListSubscriptionsByTopicCommand",
        async (command, context): Promise<unknown> =>
          await simSns.listSubscriptionsByTopic(
            command as SimListSubscriptionsByTopicCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetSubscriptionAttributesCommand",
        async (command, context): Promise<unknown> =>
          await simSns.getSubscriptionAttributes(
            command as SimGetSubscriptionAttributesCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "SetSubscriptionAttributesCommand",
        async (command, context): Promise<unknown> =>
          await simSns.setSubscriptionAttributes(
            command as SimSetSubscriptionAttributesCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PublishCommand",
        async (command, context): Promise<unknown> =>
          await simSns.publish(
            command as SimPublishCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PublishBatchCommand",
        async (command, context): Promise<unknown> =>
          await simSns.publishBatch(
            command as SimPublishBatchCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated SNS can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated SNS supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
