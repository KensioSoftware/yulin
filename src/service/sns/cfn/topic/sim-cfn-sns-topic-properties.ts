import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSnsTopicAttributeInput } from "../../topic/sim-sns-topic-attributes.js";
import { simCfnSnsAttributeValue } from "../sim-cfn-sns-attribute-value.js";
import { simCfnSnsResourceError } from "../sim-cfn-sns-resource-error.js";
import { snsTopicResourceType } from "../sim-cfn-sns-resource-types.js";
import {
  simCfnSnsInlineSubscriptions,
  type SimCfnSnsInlineSubscription,
} from "./sim-cfn-sns-inline-subscriptions.js";
import { SimCfnSnsTopicName } from "./sim-cfn-sns-topic-name.js";
import {
  attributePropertyNames,
  topicNamePropertyName,
  topicSubscriptionPropertyName,
  unsimulatedPropertyReasons,
} from "./sim-cfn-sns-topic-property-names.js";

interface SimCfnSnsTopicPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::SNS::Topic CloudFormation properties into the shape CreateTopic
 * takes.
 *
 * Most of what a template can say about a topic is a topic attribute of the
 * same name, so those are passed straight through and simulated SNS decides
 * what it will take. A property that is not an attribute, and that this
 * simulation gives no behaviour to, is refused here instead. Refusing rather
 * than dropping is the point: a topic deployed without its data protection
 * policy looks protected to the template that wrote it and redacts nothing.
 */
export class SimCfnSnsTopicProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: ReadonlyMap<string, SimCfnTemplateValue>;

  constructor(properties: SimCfnSnsTopicPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = new Map(Object.entries(properties.properties));
  }

  /**
   * The topic name.
   *
   * An unnamed topic is named after the stack and the logical ID, as real
   * CloudFormation names one.
   */
  name(): string {
    const name = this.properties.get(topicNamePropertyName);

    if (name === undefined) {
      return new SimCfnSnsTopicName({
        stackName: this.resource.stackName,
        logicalId: this.resource.logicalId,
      }).value;
    }

    if (typeof name !== "string") {
      throw this.propertyError(`${topicNamePropertyName} must be a string`);
    }

    return name;
  }

  /**
   * The topic attributes the template sets, in the string form CreateTopic
   * takes them in.
   *
   * The ones simulated SNS gives no behaviour to are passed on with the rest,
   * because refusing them is SNS's own answer and it already carries the reason
   * each one is missing. `FifoTopic` is the one that matters most: only
   * standard topics are simulated, and a topic that appeared to accept the
   * property would be a standard topic a test believed was ordered.
   */
  attributes(): SimSnsTopicAttributeInput {
    return Object.fromEntries(
      this.properties
        .entries()
        .filter(([name]) => this.isAttributeProperty(name))
        .map(([name, value]) => [name, simCfnSnsAttributeValue(value)]),
    );
  }

  /**
   * The subscriptions the topic declares inside itself.
   */
  inlineSubscriptions(): readonly SimCfnSnsInlineSubscription[] {
    return simCfnSnsInlineSubscriptions(
      this.resource.logicalId,
      this.properties.get(topicSubscriptionPropertyName),
    );
  }

  /**
   * Whether a property is handed to CreateTopic as an attribute.
   *
   * The two properties the CloudFormation layer reads itself are not. The rest
   * are refused as they are reached: the ones with a reason of their own with
   * that reason, and anything else as a property AWS::SNS::Topic does not have,
   * which is how real CloudFormation answers one too.
   */
  private isAttributeProperty(name: string): boolean {
    if (
      name === topicNamePropertyName ||
      name === topicSubscriptionPropertyName
    ) {
      return false;
    }

    if (attributePropertyNames.has(name)) {
      return true;
    }

    const unsimulatedReason = unsimulatedPropertyReasons.get(name);

    if (unsimulatedReason !== undefined) {
      throw this.propertyError(
        `${name} is a real ${snsTopicResourceType} property simulated SNS ` +
          `does not act on: ${unsimulatedReason}`,
      );
    }

    throw this.propertyError(
      `${name} is not a property of ${snsTopicResourceType}`,
    );
  }

  private propertyError(reason: string): Error {
    return simCfnSnsResourceError(
      snsTopicResourceType,
      this.resource.logicalId,
      reason,
    );
  }
}
