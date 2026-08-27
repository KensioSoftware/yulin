import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import { SimAwsMessageLog } from "../aws/message/sim-aws-message-log.js";
import type { SimIamInterServiceAuthZ } from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simIamInRegion } from "../iam/authorize/sim-iam-region-auth-z.js";
import type { SimSnsDeliveryFailure } from "./delivery/sim-sns-delivery-failures.js";
import { simSnsNoDeliveryEndpoints } from "./delivery/sim-sns-no-delivery-endpoints.js";
import type { SimSnsOutwardDeliveryEndpoints } from "./delivery/sim-sns-protocol-delivery-endpoints.js";
import type * as simSnsCommands from "./command/sim-sns-command.types.js";
import { SimSnsCommands } from "./command/sim-sns-commands.js";
import type { SimSnsRequestOptions } from "./command/sim-sns-request-options.js";
import { SimSnsCfnResourceFactory } from "./cfn/sim-sns-cfn-resource-factory.js";
import { SimSnsSdkCommandRouter } from "./sdk/sim-sns-sdk-command-router.js";
import { SimSnsSms } from "./sim-sns-sms.js";
import type { SimSnsSubscription } from "./subscription/sim-sns-subscription.js";
import { SimSnsSubscriptionStore } from "./subscription/sim-sns-subscription-store.js";
import type { SimSnsTopic } from "./topic/sim-sns-topic.js";
import { SimSnsTopicStore } from "./topic/sim-sns-topic-store.js";

interface SimSnsProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;

  /**
   * Where this scope's subscriptions deliver to, outside simulated SNS itself.
   *
   * A SimSns built on its own has none, since a queue or a function in another
   * simulated service is only reachable through SimAws. An `sms` subscription
   * needs nothing here, because simulated SNS records those itself.
   */
  readonly deliveryEndpoints?: SimSnsOutwardDeliveryEndpoints;

  /**
   * Where this scope announces the text messages it would have sent, for a
   * serving layer to print. A SimSns built on its own announces to a log
   * nobody listens to.
   */
  readonly messageLog?: SimAwsMessageLog;
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
export class SimSns extends SimSnsSms {
  private readonly topics: SimSnsTopicStore;
  private readonly subscriptions: SimSnsSubscriptionStore;
  private readonly sdkRouter: SimSnsSdkCommandRouter;
  private readonly cfnFactory: SimSnsCfnResourceFactory;

  constructor(properties: SimSnsProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      background = new BackgroundTasks(),
      deliveryEndpoints = simSnsNoDeliveryEndpoints(),
      messageLog = new SimAwsMessageLog(),
    } = properties;

    const iam = simIamInRegion(properties.iam, accountRegionScope.regionName);
    const topics = new SimSnsTopicStore();
    const subscriptions = new SimSnsSubscriptionStore();

    super({
      background,
      commands: new SimSnsCommands({
        topics,
        subscriptions,
        iam,
        background,
        deliveryEndpoints,
        accountRegionScope,
        messageLog,
      }),
    });

    this.topics = topics;
    this.subscriptions = subscriptions;
    this.sdkRouter = new SimSnsSdkCommandRouter(this);
    this.cfnFactory = new SimSnsCfnResourceFactory({ sns: this });
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
   * Find a subscription by ARN.
   *
   * This is the simulator's own accessor, for a test or a CloudFormation
   * Resource holding the ARN a Subscribe answered with.
   */
  findSubscription(arn: string): SimSnsSubscription | undefined {
    return this.subscriptions.find(arn);
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
   * Get this service's CloudFormation Resource factory.
   */
  cfnResourceFactory(): SimSnsCfnResourceFactory {
    return this.cfnFactory;
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
