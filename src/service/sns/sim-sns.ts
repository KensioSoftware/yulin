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
import { SimSnsAuthorizer } from "./command/authorize/sim-sns-authorizer.js";
import { SimSnsPublishCommands } from "./command/publish/sim-sns-publish-commands.js";
import type * as simSnsCommands from "./command/sim-sns-command.types.js";
import type { SimSnsRequestOptions } from "./command/sim-sns-request-options.js";
import { SimSnsSubscriptionAccess } from "./command/subscription/sim-sns-subscription-access.js";
import { SimSnsSubscriptionAttributeCommands } from "./command/subscription/sim-sns-subscription-attribute-commands.js";
import { SimSnsSubscriptionCommands } from "./command/subscription/sim-sns-subscription-commands.js";
import { SimSnsSubscriptionListings } from "./command/subscription/sim-sns-subscription-listings.js";
import { SimSnsCreateTopic } from "./command/topic/sim-sns-create-topic.js";
import { SimSnsTopicAccess } from "./command/topic/sim-sns-topic-access.js";
import { SimSnsTopicAttributeCommands } from "./command/topic/sim-sns-topic-attribute-commands.js";
import { SimSnsTopicCommands } from "./command/topic/sim-sns-topic-commands.js";
import { SimSnsSdkCommandRouter } from "./sdk/sim-sns-sdk-command-router.js";
import type { SimSnsSubscription } from "./subscription/sim-sns-subscription.js";
import { SimSnsSubscriptionStore } from "./subscription/sim-sns-subscription-store.js";
import type { SimSnsTopic } from "./topic/sim-sns-topic.js";
import { SimSnsTopicStore } from "./topic/sim-sns-topic-store.js";

interface SimSnsProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
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
  private readonly topicCreation: SimSnsCreateTopic;
  private readonly topicCommands: SimSnsTopicCommands;
  private readonly attributeCommands: SimSnsTopicAttributeCommands;
  private readonly subscriptionCommands: SimSnsSubscriptionCommands;
  private readonly subscriptionListings: SimSnsSubscriptionListings;
  private readonly subscriptionAttributeCommands: SimSnsSubscriptionAttributeCommands;
  private readonly publishCommands: SimSnsPublishCommands;
  private readonly background: BackgroundScheduler;
  private readonly sdkRouter = new SimSnsSdkCommandRouter(this);

  constructor(properties: SimSnsProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    const access = new SimSnsTopicAccess({
      topics: this.topics,
      authorizer: new SimSnsAuthorizer({ iam }),
      accountRegionScope,
    });
    const subscriptionAccess = new SimSnsSubscriptionAccess({
      subscriptions: this.subscriptions,
      topicAccess: access,
      accountRegionScope,
    });

    this.background = background;
    this.topicCreation = new SimSnsCreateTopic({
      topics: this.topics,
      access,
      accountRegionScope,
    });
    this.topicCommands = new SimSnsTopicCommands({
      topics: this.topics,
      subscriptions: this.subscriptions,
      access,
    });
    this.attributeCommands = new SimSnsTopicAttributeCommands({
      access,
      subscriptions: this.subscriptions,
    });
    this.subscriptionCommands = new SimSnsSubscriptionCommands({
      subscriptions: this.subscriptions,
      topicAccess: access,
      subscriptionAccess,
    });
    this.subscriptionListings = new SimSnsSubscriptionListings({
      subscriptions: this.subscriptions,
      topicAccess: access,
    });
    this.subscriptionAttributeCommands =
      new SimSnsSubscriptionAttributeCommands({ access: subscriptionAccess });
    this.publishCommands = new SimSnsPublishCommands({
      access,
      clock: background,
    });
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
    return this.topicCreation.handle(command, options);
  }

  /**
   * Handle a ListTopics Command from the SDK.
   */
  async listTopics(
    command: simSnsCommands.SimListTopicsCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimListTopicsCommandOutput> {
    await this.background.sequence();
    return this.topicCommands.listTopics(command, options);
  }

  /**
   * Handle a DeleteTopic Command from the SDK.
   */
  async deleteTopic(
    command: simSnsCommands.SimDeleteTopicCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimDeleteTopicCommandOutput> {
    await this.background.sequence();
    return this.topicCommands.deleteTopic(command, options);
  }

  /**
   * Handle a GetTopicAttributes Command from the SDK.
   */
  async getTopicAttributes(
    command: simSnsCommands.SimGetTopicAttributesCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimGetTopicAttributesCommandOutput> {
    await this.background.sequence();
    return this.attributeCommands.getTopicAttributes(command, options);
  }

  /**
   * Handle a SetTopicAttributes Command from the SDK.
   */
  async setTopicAttributes(
    command: simSnsCommands.SimSetTopicAttributesCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimSetTopicAttributesCommandOutput> {
    await this.background.sequence();
    return this.attributeCommands.setTopicAttributes(command, options);
  }

  /**
   * Handle a Subscribe Command from the SDK.
   */
  async subscribe(
    command: simSnsCommands.SimSubscribeCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimSubscribeCommandOutput> {
    await this.background.sequence();
    return this.subscriptionCommands.subscribe(command, options);
  }

  /**
   * Handle an Unsubscribe Command from the SDK.
   */
  async unsubscribe(
    command: simSnsCommands.SimUnsubscribeCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimUnsubscribeCommandOutput> {
    await this.background.sequence();
    return this.subscriptionCommands.unsubscribe(command, options);
  }

  /**
   * Handle a ListSubscriptions Command from the SDK.
   */
  async listSubscriptions(
    command: simSnsCommands.SimListSubscriptionsCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimListSubscriptionsCommandOutput> {
    await this.background.sequence();
    return this.subscriptionListings.listSubscriptions(command, options);
  }

  /**
   * Handle a ListSubscriptionsByTopic Command from the SDK.
   */
  async listSubscriptionsByTopic(
    command: simSnsCommands.SimListSubscriptionsByTopicCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimListSubscriptionsByTopicCommandOutput> {
    await this.background.sequence();
    return this.subscriptionListings.listSubscriptionsByTopic(command, options);
  }

  /**
   * Handle a GetSubscriptionAttributes Command from the SDK.
   */
  async getSubscriptionAttributes(
    command: simSnsCommands.SimGetSubscriptionAttributesCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimGetSubscriptionAttributesCommandOutput> {
    await this.background.sequence();
    return this.subscriptionAttributeCommands.getSubscriptionAttributes(
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
    return this.subscriptionAttributeCommands.setSubscriptionAttributes(
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
    return this.publishCommands.publish(command, options);
  }

  /**
   * Handle a PublishBatch Command from the SDK.
   */
  async publishBatch(
    command: simSnsCommands.SimPublishBatchCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimPublishBatchCommandOutput> {
    await this.background.sequence();
    return this.publishCommands.publishBatch(command, options);
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
