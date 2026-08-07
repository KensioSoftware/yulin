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
import type { SimSnsDeliveryEndpoints } from "./delivery/sim-sns-delivery.js";
import type { SimSnsDeliveryFailure } from "./delivery/sim-sns-delivery-failures.js";
import { SimSnsNoDeliveryEndpoints } from "./delivery/sqs/sim-aws-sns-delivery-queues.js";
import type * as simSnsCommands from "./command/sim-sns-command.types.js";
import { SimSnsCommands } from "./command/sim-sns-commands.js";
import type { SimSnsRequestOptions } from "./command/sim-sns-request-options.js";
import { SimSnsSdkCommandRouter } from "./sdk/sim-sns-sdk-command-router.js";
import type { SimSnsSubscription } from "./subscription/sim-sns-subscription.js";
import { SimSnsSubscriptionStore } from "./subscription/sim-sns-subscription-store.js";
import type { SimSnsTopic } from "./topic/sim-sns-topic.js";
import { SimSnsTopicStore } from "./topic/sim-sns-topic-store.js";

interface SimSnsProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;

  /**
   * Where this scope's subscriptions deliver to.
   *
   * A SimSns built on its own has none, since a queue in another simulated
   * service is only reachable through SimAws.
   */
  readonly deliveryEndpoints?: SimSnsDeliveryEndpoints;
}

/**
 * Simulated SNS. Handles SDK commands. Emulates AWS behaviour and state.
 *
 * Topics are scoped to an account and region, as they are on real AWS: a topic
 * name is unique within one of those scopes, and the ARN a request reaches a
 * topic by names the region.
 *
 * Only standard topics are simulated. FIFO topics are not.
 */
export class SimSns {
  private readonly topics = new SimSnsTopicStore();
  private readonly subscriptions = new SimSnsSubscriptionStore();
  private readonly commands: SimSnsCommands;
  private readonly background: BackgroundScheduler;
  private readonly sdkRouter = new SimSnsSdkCommandRouter(this);

  constructor(properties: SimSnsProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
      deliveryEndpoints = new SimSnsNoDeliveryEndpoints(),
    } = properties;

    this.background = background;
    this.commands = new SimSnsCommands({
      topics: this.topics,
      subscriptions: this.subscriptions,
      iam,
      background,
      deliveryEndpoints,
      accountRegionScope,
    });
  }

  /**
   * Every message this simulated SNS could not deliver.
   *
   * Real SNS tells the publisher nothing about a failed delivery, and neither
   * does this. A queue that is unexpectedly empty is explained here.
   */
  get deliveryFailures(): readonly SimSnsDeliveryFailure[] {
    return this.commands.fanOut.deliveryFailures;
  }

  /**
   * The certificate a delivered message's `SigningCertURL` names.
   *
   * The URL cannot be fetched, because simulated SNS is not served over HTTP,
   * so this is how a verifier gets at the certificate to check a signature
   * with. A URL this scope did not issue answers with nothing.
   */
  signingCertificate(signingCertUrl: string): string | undefined {
    return this.commands.signer.certificateFor(signingCertUrl);
  }

  /**
   * Find a topic by name.
   *
   * This is the simulator's own accessor, for tests seeding or inspecting topic
   * state without going through a Command and its authorization.
   */
  findTopic(name: string): SimSnsTopic | undefined {
    return this.topics.find(name);
  }

  /**
   * The subscriptions of a topic, by topic name.
   *
   * This is the simulator's own accessor, for a test inspecting what a topic
   * would deliver to without going through a Command and its authorization.
   */
  topicSubscriptions(topicName: string): readonly SimSnsSubscription[] {
    return this.subscriptions.forTopic(topicName);
  }

  /**
   * Handle a CreateTopic Command from the SDK.
   */
  async createTopic(
    command: simSnsCommands.SimCreateTopicCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimCreateTopicCommandOutput> {
    await this.background.sequence();
    return this.commands.topicCreation.handle(command, options);
  }

  /**
   * Handle a ListTopics Command from the SDK.
   */
  async listTopics(
    command: simSnsCommands.SimListTopicsCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimListTopicsCommandOutput> {
    await this.background.sequence();
    return this.commands.topics.listTopics(command, options);
  }

  /**
   * Handle a DeleteTopic Command from the SDK.
   */
  async deleteTopic(
    command: simSnsCommands.SimDeleteTopicCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimDeleteTopicCommandOutput> {
    await this.background.sequence();
    return this.commands.topics.deleteTopic(command, options);
  }

  /**
   * Handle a GetTopicAttributes Command from the SDK.
   */
  async getTopicAttributes(
    command: simSnsCommands.SimGetTopicAttributesCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimGetTopicAttributesCommandOutput> {
    await this.background.sequence();
    return this.commands.topicAttributes.getTopicAttributes(command, options);
  }

  /**
   * Handle a SetTopicAttributes Command from the SDK.
   */
  async setTopicAttributes(
    command: simSnsCommands.SimSetTopicAttributesCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimSetTopicAttributesCommandOutput> {
    await this.background.sequence();
    return this.commands.topicAttributes.setTopicAttributes(command, options);
  }

  /**
   * Handle a Subscribe Command from the SDK.
   */
  async subscribe(
    command: simSnsCommands.SimSubscribeCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimSubscribeCommandOutput> {
    await this.background.sequence();
    return this.commands.subscriptions.subscribe(command, options);
  }

  /**
   * Handle an Unsubscribe Command from the SDK.
   */
  async unsubscribe(
    command: simSnsCommands.SimUnsubscribeCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimUnsubscribeCommandOutput> {
    await this.background.sequence();
    return this.commands.subscriptions.unsubscribe(command, options);
  }

  /**
   * Handle a ListSubscriptions Command from the SDK.
   */
  async listSubscriptions(
    command: simSnsCommands.SimListSubscriptionsCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimListSubscriptionsCommandOutput> {
    await this.background.sequence();
    return this.commands.subscriptionListings.listSubscriptions(
      command,
      options,
    );
  }

  /**
   * Handle a ListSubscriptionsByTopic Command from the SDK.
   */
  async listSubscriptionsByTopic(
    command: simSnsCommands.SimListSubscriptionsByTopicCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimListSubscriptionsByTopicCommandOutput> {
    await this.background.sequence();
    return this.commands.subscriptionListings.listSubscriptionsByTopic(
      command,
      options,
    );
  }

  /**
   * Handle a GetSubscriptionAttributes Command from the SDK.
   */
  async getSubscriptionAttributes(
    command: simSnsCommands.SimGetSubscriptionAttributesCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimGetSubscriptionAttributesCommandOutput> {
    await this.background.sequence();
    return this.commands.subscriptionAttributes.getSubscriptionAttributes(
      command,
      options,
    );
  }

  /**
   * Handle a SetSubscriptionAttributes Command from the SDK.
   */
  async setSubscriptionAttributes(
    command: simSnsCommands.SimSetSubscriptionAttributesCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimSetSubscriptionAttributesCommandOutput> {
    await this.background.sequence();
    return this.commands.subscriptionAttributes.setSubscriptionAttributes(
      command,
      options,
    );
  }

  /**
   * Handle a Publish Command from the SDK.
   */
  async publish(
    command: simSnsCommands.SimPublishCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimPublishCommandOutput> {
    await this.background.sequence();
    return this.commands.publish.publish(command, options);
  }

  /**
   * Handle a PublishBatch Command from the SDK.
   */
  async publishBatch(
    command: simSnsCommands.SimPublishBatchCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimPublishBatchCommandOutput> {
    await this.background.sequence();
    return this.commands.publish.publishBatch(command, options);
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
