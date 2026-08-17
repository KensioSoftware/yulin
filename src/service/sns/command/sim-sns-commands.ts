import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimSnsDeliveryEndpoints } from "../delivery/sim-sns-delivery.js";
import { SimSnsDeliveryRequests } from "../delivery/sim-sns-delivery-request.js";
import { SimSnsFanOut } from "../delivery/sim-sns-fan-out.js";
import { SimSnsMessageSigner } from "../signature/sim-sns-message-signer.js";
import type { SimSnsSubscriptionStore } from "../subscription/sim-sns-subscription-store.js";
import type { SimSnsTopicStore } from "../topic/sim-sns-topic-store.js";
import { SimSnsOptOutList } from "../sms/sim-sns-opt-out-list.js";
import { SimSnsSentSmsStore } from "../sms/sim-sns-sent-sms-store.js";
import { SimSnsAuthorizer } from "./authorize/sim-sns-authorizer.js";
import { SimSnsPublishCommands } from "./publish/sim-sns-publish-commands.js";
import { SimSnsPublishDispatch } from "./publish/sim-sns-publish-dispatch.js";
import { SimSnsPublishSms } from "./publish/sim-sns-publish-sms.js";
import { SimSnsOptOutCommands } from "./sms/sim-sns-opt-out-commands.js";
import { SimSnsSubscriptionAccess } from "./subscription/sim-sns-subscription-access.js";
import { SimSnsSubscriptionAttributeCommands } from "./subscription/sim-sns-subscription-attribute-commands.js";
import { SimSnsSubscriptionCommands } from "./subscription/sim-sns-subscription-commands.js";
import { SimSnsSubscriptionListings } from "./subscription/sim-sns-subscription-listings.js";
import { SimSnsCreateTopic } from "./topic/sim-sns-create-topic.js";
import { SimSnsTopicAccess } from "./topic/sim-sns-topic-access.js";
import { SimSnsTopicAttributeCommands } from "./topic/sim-sns-topic-attribute-commands.js";
import { SimSnsTopicCommands } from "./topic/sim-sns-topic-commands.js";

interface SimSnsCommandsProperties {
  readonly topics: SimSnsTopicStore;
  readonly subscriptions: SimSnsSubscriptionStore;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
  readonly deliveryEndpoints: SimSnsDeliveryEndpoints;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Every command handler one simulated SNS scope delegates to.
 *
 * The wiring lives here rather than in the facade so that `SimSns` stays what
 * it is meant to be: state and delegation. Which handler shares which
 * collaborator is a fact about the handlers, not about the service object in
 * front of them.
 */
export class SimSnsCommands {
  public readonly topicCreation: SimSnsCreateTopic;
  public readonly topics: SimSnsTopicCommands;
  public readonly topicAttributes: SimSnsTopicAttributeCommands;
  public readonly subscriptions: SimSnsSubscriptionCommands;
  public readonly subscriptionListings: SimSnsSubscriptionListings;
  public readonly subscriptionAttributes: SimSnsSubscriptionAttributeCommands;
  public readonly publish: SimSnsPublishDispatch;
  public readonly optOut: SimSnsOptOutCommands;
  public readonly fanOut: SimSnsFanOut;
  public readonly signer: SimSnsMessageSigner;

  /** Every SMS this scope would have sent, delivered or suppressed. */
  public readonly sentSms = new SimSnsSentSmsStore();

  /** The numbers this scope will send no SMS to. */
  public readonly optOutList = new SimSnsOptOutList();

  constructor(properties: SimSnsCommandsProperties) {
    const { topics, subscriptions, accountRegionScope, background } =
      properties;
    const access = new SimSnsTopicAccess({
      topics,
      authorizer: new SimSnsAuthorizer({ iam: properties.iam }),
      accountRegionScope,
    });
    const subscriptionAccess = new SimSnsSubscriptionAccess({
      subscriptions,
      topicAccess: access,
      accountRegionScope,
    });

    this.signer = new SimSnsMessageSigner({ accountRegionScope });
    this.fanOut = new SimSnsFanOut({
      subscriptions,
      endpoints: properties.deliveryEndpoints,
      requests: new SimSnsDeliveryRequests({
        signer: this.signer,
        accountRegionScope,
      }),
      background,
    });
    this.topicCreation = new SimSnsCreateTopic({
      topics,
      access,
      accountRegionScope,
    });
    this.topics = new SimSnsTopicCommands({ topics, subscriptions, access });
    this.topicAttributes = new SimSnsTopicAttributeCommands({
      access,
      subscriptions,
    });
    this.subscriptions = new SimSnsSubscriptionCommands({
      subscriptions,
      topicAccess: access,
      subscriptionAccess,
    });
    this.subscriptionListings = new SimSnsSubscriptionListings({
      subscriptions,
      topicAccess: access,
    });
    this.subscriptionAttributes = new SimSnsSubscriptionAttributeCommands({
      access: subscriptionAccess,
    });
    this.publish = new SimSnsPublishDispatch({
      topic: new SimSnsPublishCommands({
        access,
        clock: background,
        fanOut: this.fanOut,
      }),
      sms: new SimSnsPublishSms({
        access,
        clock: background,
        optOutList: this.optOutList,
        sent: this.sentSms,
      }),
    });
    this.optOut = new SimSnsOptOutCommands({
      access,
      optOutList: this.optOutList,
    });
  }
}
