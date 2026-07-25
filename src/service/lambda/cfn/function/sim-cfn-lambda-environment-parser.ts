import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimLambdaFunctionEnvironment } from "../../command/create-function/create-function.command.js";
import { SimCfnLambdaPropertyParser } from "./sim-cfn-lambda-property-parser.js";

/**
 * Parses the nested AWS::Lambda::Function Environment property.
 *
 * Its own parser because Environment is the one function property with a
 * shape of its own rather than a plain scalar: an object holding a map of
 * variables, each of which has to be checked individually.
 */
export class SimCfnLambdaEnvironmentParser {
  private readonly propertyParser = new SimCfnLambdaPropertyParser();

  /**
   * Parse the Environment property into the declared function environment.
   */
  parse(
    resource: SimCfnResource,
    environment: SimCfnTemplateValue | undefined,
  ): SimLambdaFunctionEnvironment | undefined {
    if (environment === undefined) {
      return undefined;
    }

    if (!isRecord(environment)) {
      throw this.propertyParser.invalidPropertyError(
        resource,
        "Environment",
        "an object",
      );
    }

    const variables = this.propertyParser.optionalStringRecord(
      resource,
      environment["Variables"],
      "Environment.Variables",
    );
    if (variables === undefined) {
      return undefined;
    }

    return { Variables: variables };
  }
}
