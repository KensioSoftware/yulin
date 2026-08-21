import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type {
  SimLambdaDestination,
  SimLambdaDestinationConfiguration,
} from "../../function/event-invoke/sim-lambda-event-invoke-config.js";
import { SimCfnLambdaPropertyParser } from "../function/sim-cfn-lambda-property-parser.js";
import { SimCfnLambdaTargetArn } from "../sim-cfn-lambda-target-arn.js";

/**
 * Parses the nested AWS::Lambda::EventInvokeConfig DestinationConfig
 * property.
 *
 * Its own parser because DestinationConfig is the one property of the
 * Resource with a shape rather than a scalar: two ends, each an object holding
 * somewhere to send to, and each read on its own so a config keeps the end it
 * can reach when the other names somewhere it cannot.
 */
export class SimCfnLambdaEventInvokeDestinations {
  private readonly propertyParser = new SimCfnLambdaPropertyParser();
  private readonly targetArn = new SimCfnLambdaTargetArn();

  /**
   * Parse the DestinationConfig property into where results are sent.
   */
  parse(
    resource: SimCfnResource,
    config: SimCfnTemplateValue | undefined,
  ): SimLambdaDestinationConfiguration | undefined {
    if (config === undefined) {
      return undefined;
    }

    if (!isRecord(config)) {
      throw this.propertyParser.invalidPropertyError(
        resource,
        "DestinationConfig",
        "an object",
      );
    }

    return {
      OnSuccess: this.destination(resource, config["OnSuccess"], "OnSuccess"),
      OnFailure: this.destination(resource, config["OnFailure"], "OnFailure"),
    };
  }

  /**
   * One end of the config, left off where the simulation has nowhere to send
   * it.
   */
  private destination(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    name: string,
  ): SimLambdaDestination | undefined {
    if (value === undefined) {
      return undefined;
    }

    const path = `DestinationConfig.${name}`;

    if (!isRecord(value)) {
      throw this.propertyParser.invalidPropertyError(
        resource,
        path,
        "an object",
      );
    }

    const destination = this.targetArn.destination(
      resource,
      value["Destination"],
      `${path}.Destination`,
    );

    return destination === undefined ? undefined : { Destination: destination };
  }
}
