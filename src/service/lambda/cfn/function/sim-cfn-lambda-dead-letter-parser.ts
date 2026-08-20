import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimLambdaDeadLetterConfigInput } from "../../function/event-invoke/lambda-dead-letter-target.js";
import { SimCfnLambdaTargetArn } from "../sim-cfn-lambda-target-arn.js";
import { SimCfnLambdaPropertyParser } from "./sim-cfn-lambda-property-parser.js";

/**
 * Parses the nested AWS::Lambda::Function DeadLetterConfig property.
 *
 * This is what CDK's `deadLetterQueue` synthesizes, and a template names the
 * queue or topic by `Fn::GetAtt` on its ARN or by `Ref`, so both are read the
 * way an event source mapping reads the source it polls.
 */
export class SimCfnLambdaDeadLetterParser {
  private readonly propertyParser = new SimCfnLambdaPropertyParser();
  private readonly targetArn = new SimCfnLambdaTargetArn();

  /**
   * Parse the DeadLetterConfig property into the dead-letter target the
   * function is created with.
   */
  parse(
    resource: SimCfnResource,
    config: SimCfnTemplateValue | undefined,
  ): SimLambdaDeadLetterConfigInput | undefined {
    if (config === undefined) {
      return undefined;
    }

    if (!isRecord(config)) {
      throw this.propertyParser.invalidPropertyError(
        resource,
        "DeadLetterConfig",
        "an object",
      );
    }

    const targetArn = this.targetArn.deadLetter(
      resource,
      config["TargetArn"],
      "DeadLetterConfig.TargetArn",
    );

    return targetArn === undefined ? undefined : { TargetArn: targetArn };
  }
}
