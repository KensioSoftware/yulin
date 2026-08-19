import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimLambdaFunctionAlias } from "../../function/version/sim-lambda-function-alias.js";
import type { SimLambda } from "../../sim-lambda.js";
import { SimCfnLambdaPropertyParser } from "../function/sim-cfn-lambda-property-parser.js";
import { simCfnLambdaTargetFunctionName } from "../function/sim-cfn-lambda-target-function.js";

interface SimCfnLambdaAliasCreatorProperties {
  readonly lambda: SimLambda;
}

/**
 * Creates Lambda aliases from CloudFormation Resources.
 *
 * This is what CDK emits for `new lambda.Alias(...)` and for
 * `fn.addAlias("live")`, and it is what the rest of such an app points at, so
 * an integration deployed beside it reaches the version the alias names rather
 * than `$LATEST`.
 *
 * `RoutingConfig` weights and `ProvisionedConcurrencyConfig` are not
 * simulated. An alias here names one version, so a template splitting traffic
 * across two gets the version its `FunctionVersion` names.
 */
export class SimCfnLambdaAliasCreator {
  private readonly lambda: SimLambda;
  private readonly propertyParser = new SimCfnLambdaPropertyParser();

  constructor(properties: SimCfnLambdaAliasCreatorProperties) {
    this.lambda = properties.lambda;
  }

  /**
   * Create an alias from an AWS::Lambda::Alias Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimLambdaFunctionAlias> {
    const functionName = simCfnLambdaTargetFunctionName(
      this.propertyParser.requiredString(
        resource,
        properties["FunctionName"],
        "FunctionName",
      ),
    );
    const name = this.propertyParser.requiredString(
      resource,
      properties["Name"],
      "Name",
    );

    await this.lambda.createAlias({
      input: {
        FunctionName: functionName,
        Name: name,
        FunctionVersion: this.propertyParser.requiredString(
          resource,
          properties["FunctionVersion"],
          "FunctionVersion",
        ),
        Description: this.propertyParser.optionalString(
          resource,
          properties["Description"],
          "Description",
        ),
      },
    });

    const alias = this.lambda.getSimFunctionAlias(functionName, name);
    assertDefined(
      alias,
      `Sim Lambda alias ${name} of ${functionName} after CloudFormation creation`,
    );

    return alias;
  }
}
