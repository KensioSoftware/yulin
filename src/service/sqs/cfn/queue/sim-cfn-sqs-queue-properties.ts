import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSqsQueueAttributeInput } from "../../queue/sim-sqs-queue-attributes.js";
import { SimCfnSqsQueueName } from "./sim-cfn-sqs-queue-name.js";
import {
  SimCfnSqsQueuePropertyRules,
  sqsQueuePropertyError,
} from "./sim-cfn-sqs-queue-property-rules.js";

interface SimCfnSqsQueuePropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::SQS::Queue CloudFormation properties into the shape CreateQueue
 * takes.
 *
 * The queue attributes are passed through as the strings SQS carries them as,
 * so the range each one is checked against is the range simulated SQS already
 * applies to a CreateQueue request.
 */
export class SimCfnSqsQueueProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly rules: SimCfnSqsQueuePropertyRules;

  constructor(properties: SimCfnSqsQueuePropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;
    this.rules = new SimCfnSqsQueuePropertyRules({
      logicalId: properties.resource.logicalId,
      properties: properties.properties,
    });
  }

  /**
   * The queue name.
   *
   * An unnamed queue is named after the stack and the logical ID, as real
   * CloudFormation names one.
   */
  name(): string {
    const name = this.properties["QueueName"];

    if (name === undefined) {
      return new SimCfnSqsQueueName({
        stackName: this.resource.stackName,
        logicalId: this.resource.logicalId,
      }).value;
    }

    if (typeof name !== "string") {
      throw this.propertyError("QueueName must be a string");
    }

    return name;
  }

  /**
   * The queue attributes the template sets, in the string form CreateQueue
   * takes them in.
   */
  attributes(): SimSqsQueueAttributeInput {
    this.rules.assertSimulated();

    return Object.fromEntries(
      Object.entries(this.properties)
        .filter(([name]) => this.rules.isAttributeProperty(name))
        .map(([name, value]) => [name, this.numberValue(value, name)]),
    );
  }

  /**
   * Read a numeric property as the string an SQS attribute carries.
   *
   * CloudFormation carries these as numbers, and as strings when they came from
   * a template Parameter, so both are accepted. What each number has to be is
   * left to SQS.
   */
  private numberValue(value: SimCfnTemplateValue, name: string): string {
    if (typeof value === "number") {
      return String(value);
    }

    if (typeof value === "string") {
      return value;
    }

    throw this.propertyError(`${name} must be a number`);
  }

  private propertyError(reason: string): Error {
    return sqsQueuePropertyError(this.resource.logicalId, reason);
  }
}
