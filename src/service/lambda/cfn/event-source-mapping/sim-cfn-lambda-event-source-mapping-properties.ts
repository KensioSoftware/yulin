import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateEventSourceMappingCommandInput } from "../../command/event-source-mapping/event-source-mapping.command.js";
import type { SimLambdaFunctionResponseType } from "../../event-source/sim-lambda-event-source-mapping.js";
import { SimCfnLambdaPropertyParser } from "../function/sim-cfn-lambda-property-parser.js";
import { assertSimulatedEventSourceMappingProperties } from "./sim-cfn-lambda-event-source-mapping-property-rules.js";
import { simCfnLambdaTargetFunctionName } from "../function/sim-cfn-lambda-target-function.js";

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
   * The create input this Resource asks for, refusing what is not simulated.
   */
  createInput(): SimCreateEventSourceMappingCommandInput {
    assertSimulatedEventSourceMappingProperties(
      this.resource.logicalId,
      this.properties,
    );

    return {
      EventSourceArn: this.parser.requiredString(
        this.resource,
        this.properties["EventSourceArn"],
        "EventSourceArn",
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
      FunctionResponseTypes: this.functionResponseTypes(),
    };
  }

  private functionResponseTypes():
    readonly SimLambdaFunctionResponseType[] | undefined {
    return this.parser.optionalStringList(
      this.resource,
      this.properties["FunctionResponseTypes"],
      "FunctionResponseTypes",
    ) as readonly SimLambdaFunctionResponseType[] | undefined;
  }
}
