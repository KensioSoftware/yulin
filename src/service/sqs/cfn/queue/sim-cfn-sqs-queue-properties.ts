import { jsonStringify } from "../../../../util/type-guard/json.js";
import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSqsQueueAttributeInput } from "../../queue/sim-sqs-queue-attributes.js";
import { simSqsJsonQueueAttributeNames } from "../../queue/sim-sqs-queue-attribute-specs.js";
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
      ignorer: properties.resource,
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
    this.rules.apply();

    return Object.fromEntries(
      Object.entries(this.properties)
        .filter(([name]) => this.rules.isAttributeProperty(name))
        .map(([name, value]) => [name, this.attributeValue(value, name)]),
    );
  }

  /**
   * Read one property as the string the attribute of that name carries.
   *
   * Five of these properties are amounts and `RedrivePolicy` is a JSON
   * document, so the two are read differently.
   */
  private attributeValue(value: SimCfnTemplateValue, name: string): string {
    if (simSqsJsonQueueAttributeNames.has(name)) {
      return this.documentValue(value, name);
    }

    return this.numberValue(value, name);
  }

  /**
   * Read a JSON document property as the string an SQS attribute carries.
   *
   * CloudFormation carries the document as an object, and as a string when it
   * came from a template Parameter or from a Terraform plan holding it as one.
   * What the document has to say is left to SQS, which refuses a bad redrive
   * policy in its own words.
   */
  private documentValue(value: SimCfnTemplateValue, name: string): string {
    if (typeof value === "string") {
      return value;
    }

    if (isRecord(value)) {
      return jsonStringify(value);
    }

    throw this.propertyError(`${name} must be a JSON document`);
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
