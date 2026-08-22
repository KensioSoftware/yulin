import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateDeliveryStreamCommandInput } from "../../command/stream/stream.command.js";
import { simCfnFirehoseDeliveryStreamPropertyError } from "../sim-cfn-firehose-resource-error.js";
import { SimCfnFirehoseDeliveryStreamName } from "./sim-cfn-firehose-delivery-stream-name.js";
import {
  deliveryStreamNamePropertyName,
  deliveryStreamTypePropertyName,
  kinesisStreamSourcePropertyName,
  tagsPropertyName,
  unsimulatedPropertyReasons,
} from "./sim-cfn-firehose-delivery-stream-property-names.js";
import { simCfnFirehoseDestination } from "./sim-cfn-firehose-destination-choice.js";
import { simCfnFirehoseTags } from "./sim-cfn-firehose-tags.js";

interface SimCfnFirehoseDeliveryStreamPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::KinesisFirehose::DeliveryStream CloudFormation properties into the
 * shape CreateDeliveryStream takes.
 *
 * What a template may ask for is decided by simulated Firehose rather than
 * here, so a name, a Bucket ARN or buffering hints it will not take are refused
 * by the command that reads them. What this reads is the shape: a property that
 * has to be a string, a number or a record is checked for being one, since a
 * template that put an object where a name goes has made a mistake
 * CreateDeliveryStream cannot explain.
 *
 * `KinesisStreamSourceConfiguration` goes through as the template wrote it, so
 * where a delivery stream reads from is decided in one place.
 */
export class SimCfnFirehoseDeliveryStreamProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: ReadonlyMap<string, SimCfnTemplateValue>;

  constructor(properties: SimCfnFirehoseDeliveryStreamPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = new Map(Object.entries(properties.properties));

    this.recordUnsimulated();
  }

  /**
   * The delivery stream name.
   *
   * An unnamed delivery stream is named after the stack and the logical ID, as
   * real CloudFormation names one.
   */
  name(): string {
    const name = this.properties.get(deliveryStreamNamePropertyName);

    if (name === undefined) {
      return new SimCfnFirehoseDeliveryStreamName({
        stackName: this.resource.stackName,
        logicalId: this.resource.logicalId,
      }).value;
    }

    if (typeof name !== "string") {
      throw this.error(`${deliveryStreamNamePropertyName} must be a string`);
    }

    return name;
  }

  /**
   * The whole request, as CreateDeliveryStream takes it.
   */
  createInput(): SimCreateDeliveryStreamCommandInput {
    const type = this.deliveryStreamType();
    const source = this.properties.get(kinesisStreamSourcePropertyName);
    const tags = simCfnFirehoseTags(
      this.resource,
      this.properties.get(tagsPropertyName),
    );

    return {
      DeliveryStreamName: this.name(),
      ...(type !== undefined && { DeliveryStreamType: type }),
      ...(source !== undefined && {
        KinesisStreamSourceConfiguration: source,
      }),
      ...(tags !== undefined && { Tags: tags }),
      ...simCfnFirehoseDestination(this.resource, this.properties),
    };
  }

  /**
   * Where the delivery stream reads its records from, when the template says.
   */
  private deliveryStreamType(): string | undefined {
    const type = this.properties.get(deliveryStreamTypePropertyName);

    if (type === undefined) {
      return undefined;
    }

    if (typeof type !== "string") {
      throw this.error(`${deliveryStreamTypePropertyName} must be a string`);
    }

    return type;
  }

  /**
   * Record the properties this simulation gives no behaviour to.
   */
  private recordUnsimulated(): void {
    for (const [name, reason] of unsimulatedPropertyReasons) {
      if (this.properties.has(name)) {
        this.resource.ignoreProperty(name, reason);
      }
    }
  }

  private error(reason: string): Error {
    return simCfnFirehoseDeliveryStreamPropertyError(
      this.resource.logicalId,
      reason,
    );
  }
}
