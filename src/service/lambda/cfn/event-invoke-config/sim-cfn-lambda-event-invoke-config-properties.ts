import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimPutFunctionEventInvokeConfigCommandInput } from "../../command/put-function-event-invoke-config/put-function-event-invoke-config.command.js";
import { SimCfnLambdaPropertyParser } from "../function/sim-cfn-lambda-property-parser.js";
import { simCfnLambdaTargetFunctionName } from "../function/sim-cfn-lambda-target-function.js";
import { recordUnreadEventInvokeConfigProperties } from "./sim-cfn-lambda-event-invoke-config-property-rules.js";
import { SimCfnLambdaEventInvokeDestinations } from "./sim-cfn-lambda-event-invoke-destinations.js";

interface SimCfnLambdaEventInvokeConfigPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * The PutFunctionEventInvokeConfig input, and which function it is for.
 *
 * The function and qualifier are carried beside the input because they are
 * what the config is held under, and the creator reads the config back with
 * them once the command has written it.
 */
export interface SimCfnLambdaEventInvokeConfigInput {
  readonly functionName: string;
  readonly qualifier: string | undefined;
  readonly input: SimPutFunctionEventInvokeConfigCommandInput;
}

/**
 * Reads an AWS::Lambda::EventInvokeConfig Resource into the input
 * PutFunctionEventInvokeConfig takes.
 *
 * Nothing about retry counts or event ages is decided here. The command
 * refuses what real Lambda refuses, so a config a template deployed is the
 * same thing an SDK caller would have got.
 */
export class SimCfnLambdaEventInvokeConfigProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly parser = new SimCfnLambdaPropertyParser();
  private readonly destinations = new SimCfnLambdaEventInvokeDestinations();

  constructor(properties: SimCfnLambdaEventInvokeConfigPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;
  }

  /**
   * The put input this Resource asks for.
   */
  createInput(): SimCfnLambdaEventInvokeConfigInput {
    recordUnreadEventInvokeConfigProperties(this.resource, this.properties);

    const functionName = simCfnLambdaTargetFunctionName(
      this.parser.requiredString(
        this.resource,
        this.properties["FunctionName"],
        "FunctionName",
      ),
    );
    const qualifier = this.parser.optionalString(
      this.resource,
      this.properties["Qualifier"],
      "Qualifier",
    );

    return {
      functionName,
      qualifier,
      input: {
        FunctionName: functionName,
        Qualifier: qualifier,
        MaximumRetryAttempts: this.parser.optionalNumber(
          this.resource,
          this.properties["MaximumRetryAttempts"],
          "MaximumRetryAttempts",
        ),
        MaximumEventAgeInSeconds: this.parser.optionalNumber(
          this.resource,
          this.properties["MaximumEventAgeInSeconds"],
          "MaximumEventAgeInSeconds",
        ),
        DestinationConfig: this.destinations.parse(
          this.resource,
          this.properties["DestinationConfig"],
        ),
      },
    };
  }
}
