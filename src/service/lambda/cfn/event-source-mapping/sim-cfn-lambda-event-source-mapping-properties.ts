import { simLambdaStreamDestinationConfig } from "../../event-source/sim-lambda-stream-destination-config.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateEventSourceMappingCommandInput } from "../../command/event-source-mapping/event-source-mapping.command.js";
import type { SimLambdaFunctionResponseType } from "../../event-source/sim-lambda-event-source-mapping.js";
import { SimCfnLambdaPropertyParser } from "../function/sim-cfn-lambda-property-parser.js";
import { recordUnsimulatedEventSourceMappingProperties } from "./sim-cfn-lambda-event-source-mapping-property-rules.js";
import { simCfnLambdaTargetFunctionName } from "../function/sim-cfn-lambda-target-function.js";

/**
 * What a CloudFormation Unix time seconds value is multiplied by to reach the
 * milliseconds a Date takes.
 */
const millisecondsPerSecond = 1000;

interface SimCfnLambdaEventSourceMappingPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads an AWS::Lambda::EventSourceMapping Resource into the input
 * CreateEventSourceMapping takes.
 *
 * Nothing about batch sizes or event source ARNs is decided here: the command
 * validates those, so a mapping a template deployed is the same thing an SDK
 * caller would have got.
 */
export class SimCfnLambdaEventSourceMappingProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly parser = new SimCfnLambdaPropertyParser();

  constructor(properties: SimCfnLambdaEventSourceMappingPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;
  }

  /**
   * The create input this Resource asks for, recording what is left out of it.
   *
   * The event source ARN is read before anything else is judged, as the command
   * reads it first for the same reason: what a mapping may ask for depends on
   * the kind of source it names.
   */
  createInput(): SimCreateEventSourceMappingCommandInput {
    const eventSourceArn = this.parser.requiredString(
      this.resource,
      this.properties["EventSourceArn"],
      "EventSourceArn",
    );

    recordUnsimulatedEventSourceMappingProperties(
      this.resource,
      this.properties,
    );

    return {
      EventSourceArn: eventSourceArn,
      DestinationConfig: simLambdaStreamDestinationConfig(
        this.properties["DestinationConfig"],
      ),
      FunctionName: simCfnLambdaTargetFunctionName(
        this.parser.requiredString(
          this.resource,
          this.properties["FunctionName"],
          "FunctionName",
        ),
      ),
      BatchSize: this.parser.optionalNumber(
        this.resource,
        this.properties["BatchSize"],
        "BatchSize",
      ),
      Enabled: this.parser.optionalBoolean(
        this.resource,
        this.properties["Enabled"],
        "Enabled",
      ),
      MaximumBatchingWindowInSeconds: this.parser.optionalNumber(
        this.resource,
        this.properties["MaximumBatchingWindowInSeconds"],
        "MaximumBatchingWindowInSeconds",
      ),
      MaximumRetryAttempts: this.parser.optionalNumber(
        this.resource,
        this.properties["MaximumRetryAttempts"],
        "MaximumRetryAttempts",
      ),
      MaximumRecordAgeInSeconds: this.parser.optionalNumber(
        this.resource,
        this.properties["MaximumRecordAgeInSeconds"],
        "MaximumRecordAgeInSeconds",
      ),
      StartingPosition: this.parser.optionalString(
        this.resource,
        this.properties["StartingPosition"],
        "StartingPosition",
      ),
      StartingPositionTimestamp: this.startingPositionTimestamp(),
      FunctionResponseTypes: this.functionResponseTypes(),
    };
  }

  /**
   * The instant a mapping asked to start reading from.
   *
   * CloudFormation carries it as Unix time seconds where the command takes a
   * Date. Nothing judges it here: every source this simulation has refuses the
   * property, a queue because it has no starting position at all and a stream
   * because a timestamp only goes with the Kinesis-only `AT_TIMESTAMP`, so the
   * refusal comes from the command and names the property.
   */
  private startingPositionTimestamp(): Date | undefined {
    const seconds = this.parser.optionalNumber(
      this.resource,
      this.properties["StartingPositionTimestamp"],
      "StartingPositionTimestamp",
    );

    if (seconds === undefined) {
      return undefined;
    }

    return new Date(seconds * millisecondsPerSecond);
  }

  private functionResponseTypes():
    | readonly SimLambdaFunctionResponseType[]
    | undefined {
    return this.parser.optionalStringList(
      this.resource,
      this.properties["FunctionResponseTypes"],
      "FunctionResponseTypes",
    ) as readonly SimLambdaFunctionResponseType[] | undefined;
  }
}
