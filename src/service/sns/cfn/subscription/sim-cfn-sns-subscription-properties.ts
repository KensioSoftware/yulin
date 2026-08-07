import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSubscribeCommandInput } from "../../command/subscription/subscription.command.js";
import type { SimSnsSubscriptionAttributeInput } from "../../subscription/sim-sns-subscription-attributes.js";
import { simCfnSnsAttributeValue } from "../sim-cfn-sns-attribute-value.js";
import { simCfnSnsResourceError } from "../sim-cfn-sns-resource-error.js";
import { snsSubscriptionResourceType } from "../sim-cfn-sns-resource-types.js";
import {
  attributePropertyNames,
  subscriptionEndpointPropertyName,
  subscriptionPropertyNames,
  subscriptionProtocolPropertyName,
  subscriptionTopicArnPropertyName,
  unsimulatedPropertyReasons,
} from "./sim-cfn-sns-subscription-property-names.js";

interface SimCfnSnsSubscriptionPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::SNS::Subscription CloudFormation properties into the shape
 * Subscribe takes.
 *
 * The three settings this simulation acts on, `RawMessageDelivery`, the filter
 * policy and its scope, are attributes of the same name, so they go through as
 * attributes and are validated exactly as an SDK caller's are. A filter policy
 * is written as an object in a template and set as a JSON string through the
 * API, which is the only conversion needed on the way.
 */
export class SimCfnSnsSubscriptionProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: ReadonlyMap<string, SimCfnTemplateValue>;

  constructor(properties: SimCfnSnsSubscriptionPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = new Map(Object.entries(properties.properties));
  }

  /**
   * The Subscribe request the Resource describes.
   */
  input(): SimSubscribeCommandInput {
    return {
      TopicArn: this.requiredString(subscriptionTopicArnPropertyName),
      Protocol: this.requiredString(subscriptionProtocolPropertyName),
      Endpoint: this.endpoint(),
      Attributes: this.attributes(),
    };
  }

  /**
   * What the subscription delivers to.
   *
   * Real CloudFormation leaves it optional, because a protocol such as `sms`
   * carries the destination elsewhere. Neither protocol simulated here is one
   * of those, so an absent endpoint is refused by Subscribe rather than here.
   */
  private endpoint(): string | undefined {
    const endpoint = this.properties.get(subscriptionEndpointPropertyName);

    if (endpoint === undefined) {
      return undefined;
    }

    if (typeof endpoint !== "string") {
      throw this.propertyError(
        `${subscriptionEndpointPropertyName} must be a string`,
      );
    }

    return endpoint;
  }

  private attributes(): SimSnsSubscriptionAttributeInput {
    return Object.fromEntries(
      this.properties
        .entries()
        .filter(([name]) => this.isAttributeProperty(name))
        .map(([name, value]) => [name, simCfnSnsAttributeValue(value)]),
    );
  }

  /**
   * Whether a property is handed to Subscribe as an attribute.
   *
   * The properties naming the subscription itself are not. Anything else with
   * no attribute behind it is refused, rather than deployed as a subscription
   * quietly missing whatever it asked for.
   */
  private isAttributeProperty(name: string): boolean {
    if (subscriptionPropertyNames.has(name)) {
      return false;
    }

    if (attributePropertyNames.has(name)) {
      return true;
    }

    const unsimulatedReason = unsimulatedPropertyReasons.get(name);

    if (unsimulatedReason !== undefined) {
      throw this.propertyError(
        `${name} is a real ${snsSubscriptionResourceType} property simulated ` +
          `SNS does not act on: ${unsimulatedReason}`,
      );
    }

    throw this.propertyError(
      `${name} is not a property of ${snsSubscriptionResourceType}`,
    );
  }

  private requiredString(name: string): string {
    const value = this.properties.get(name);

    if (typeof value !== "string") {
      throw this.propertyError(`${name} is required and must be a string`);
    }

    return value;
  }

  private propertyError(reason: string): Error {
    return simCfnSnsResourceError(
      snsSubscriptionResourceType,
      this.resource.logicalId,
      reason,
    );
  }
}
