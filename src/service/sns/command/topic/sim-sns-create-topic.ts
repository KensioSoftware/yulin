import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimSnsTopic } from "../../topic/sim-sns-topic.js";
import { SimSnsTopicAttributes } from "../../topic/sim-sns-topic-attributes.js";
import { SimSnsTopicName } from "../../topic/sim-sns-topic-name.js";
import type { SimSnsTopicStore } from "../../topic/sim-sns-topic-store.js";
import type { SimSnsRequestOptions } from "../sim-sns-request-options.js";
import type { SimSnsTopicAccess } from "./sim-sns-topic-access.js";
import { refuseUnsimulatedTopicInput } from "./sim-sns-unsimulated-topic-input.js";
import type {
  SimCreateTopicCommand,
  SimCreateTopicCommandOutput,
} from "./topic.command.js";

interface SimSnsCreateTopicProperties {
  readonly topics: SimSnsTopicStore;
  readonly access: SimSnsTopicAccess;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The CreateTopic command.
 *
 * Real SNS treats it as idempotent and leaves the existing topic alone: a
 * request for a name already taken answers with that topic's ARN without
 * applying the attributes it carries. That differs from SQS, which compares the
 * attributes and fails when they differ, and it is what makes a deployment
 * which creates its own topic safe to run twice.
 */
export class SimSnsCreateTopic {
  private readonly topics: SimSnsTopicStore;
  private readonly access: SimSnsTopicAccess;
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimSnsCreateTopicProperties) {
    this.topics = properties.topics;
    this.access = properties.access;
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Create a topic, or answer with the existing one of that name.
   *
   * The attributes are read before the existing topic is looked for, so a
   * request naming one this simulation will not take is refused whether or not
   * the topic is already there. Reading them and then dropping them would leave
   * a repeated create quietly accepting an attribute the first one was refused
   * for.
   */
  handle(
    command: SimCreateTopicCommand,
    options?: SimSnsRequestOptions,
  ): SimCreateTopicCommandOutput {
    const input = command.input;

    refuseUnsimulatedTopicInput(input);

    const name = SimSnsTopicName.required(input.Name);
    const attributes = SimSnsTopicAttributes.defaults().with(
      input.Attributes ?? {},
    );

    this.access.authorizeName("sns:CreateTopic", name.value, options);

    const topic =
      this.topics.find(name.value) ?? this.created(name, attributes);

    return { $metadata: {}, TopicArn: topic.arn.value };
  }

  /**
   * Create the topic itself, once the name is known to be free.
   */
  private created(
    name: SimSnsTopicName,
    attributes: SimSnsTopicAttributes,
  ): SimSnsTopic {
    const topic = new SimSnsTopic({
      name,
      accountRegionScope: this.accountRegionScope,
      attributes,
    });

    this.topics.add(topic);

    return topic;
  }
}
