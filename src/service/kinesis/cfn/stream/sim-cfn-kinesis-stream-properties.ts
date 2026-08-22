import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimKinesisTags } from "../../command/stream/stream.command.js";
import { simCfnKinesisResourceError } from "../sim-cfn-kinesis-resource-error.js";
import { kinesisStreamResourceType } from "../sim-cfn-kinesis-resource-types.js";
import { SimCfnKinesisStreamName } from "./sim-cfn-kinesis-stream-name.js";
import {
  retentionPropertyName,
  shardCountPropertyName,
  streamModeDetailsPropertyName,
  streamNamePropertyName,
  tagsPropertyName,
  unsimulatedPropertyReasons,
} from "./sim-cfn-kinesis-stream-property-names.js";

interface SimCfnKinesisStreamPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::Kinesis::Stream CloudFormation properties into the shapes the
 * Kinesis commands take.
 *
 * What a template may ask for is decided by simulated Kinesis rather than here,
 * so a shard count or a retention it will not take is refused by the command
 * that reads it. What this reads is the shape: a property that has to be a
 * string, a number or a record is checked for being one, since a template that
 * put an object where a name goes has made a mistake CreateStream cannot
 * explain.
 */
export class SimCfnKinesisStreamProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: ReadonlyMap<string, SimCfnTemplateValue>;

  constructor(properties: SimCfnKinesisStreamPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = new Map(Object.entries(properties.properties));

    this.recordUnsimulated();
  }

  /**
   * The stream name.
   *
   * An unnamed stream is named after the stack and the logical ID, as real
   * CloudFormation names one.
   */
  name(): string {
    const name = this.properties.get(streamNamePropertyName);

    if (name === undefined) {
      return new SimCfnKinesisStreamName({
        stackName: this.resource.stackName,
        logicalId: this.resource.logicalId,
      }).value;
    }

    if (typeof name !== "string") {
      throw this.propertyError(`${streamNamePropertyName} must be a string`);
    }

    return name;
  }

  /**
   * How many shards the stream is created with, when the template says.
   */
  shardCount(): number | undefined {
    return this.optionalNumber(shardCountPropertyName);
  }

  /**
   * How long the stream keeps a record, when the template says.
   */
  retentionHours(): number | undefined {
    return this.optionalNumber(retentionPropertyName);
  }

  /**
   * The capacity mode the stream is created in, when the template says.
   */
  streamMode(): string | undefined {
    const details = this.properties.get(streamModeDetailsPropertyName);

    if (details === undefined) {
      return undefined;
    }

    if (!isRecord(details)) {
      throw this.propertyError(
        `${streamModeDetailsPropertyName} must be an object`,
      );
    }

    const mode = details["StreamMode"];

    if (mode !== undefined && typeof mode !== "string") {
      throw this.propertyError(
        `${streamModeDetailsPropertyName}.StreamMode must be a string`,
      );
    }

    return mode;
  }

  /**
   * The tags the stream is created with, as CreateStream takes them.
   *
   * A template writes them as a list of key and value pairs, and the Kinesis
   * API takes a record, so they are turned over here.
   */
  tags(): SimKinesisTags | undefined {
    const tags = this.properties.get(tagsPropertyName);

    if (tags === undefined) {
      return undefined;
    }

    if (!Array.isArray(tags)) {
      throw this.propertyError(`${tagsPropertyName} must be a list`);
    }

    return Object.fromEntries(tags.map((tag) => this.tagEntry(tag)));
  }

  /**
   * One tag, as the key and value a template wrote it as.
   */
  private tagEntry(tag: unknown): readonly [string, string] {
    if (
      !isRecord(tag) ||
      typeof tag["Key"] !== "string" ||
      typeof tag["Value"] !== "string"
    ) {
      throw this.propertyError(
        `${tagsPropertyName} entries must each carry a string Key and Value`,
      );
    }

    return [tag["Key"], tag["Value"]];
  }

  /**
   * A property that has to be a number, when the template carries one.
   */
  private optionalNumber(name: string): number | undefined {
    const value = this.properties.get(name);

    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "number") {
      throw this.propertyError(`${name} must be a number`);
    }

    return value;
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

  private propertyError(reason: string): Error {
    return simCfnKinesisResourceError(
      kinesisStreamResourceType,
      this.resource.logicalId,
      reason,
    );
  }
}
