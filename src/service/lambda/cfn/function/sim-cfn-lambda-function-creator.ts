import type { SimCfnExecutableResourceBinding } from "../../../cloudformation/bind/sim-cfn-exec-binding.type.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import type { SimLambda } from "../../sim-lambda.js";
import { simCfnLambdaCodeInput } from "./sim-cfn-lambda-code-input.js";
import { SimCfnLambdaCreationSkips } from "./sim-cfn-lambda-creation-skips.js";
import {
  simCfnLambdaCreateFunctionInput,
  SimCfnLambdaFunctionPropertiesParser,
} from "./sim-cfn-lambda-function-properties-parser.js";

interface SimCfnLambdaFunctionCreatorProperties {
  readonly lambda: SimLambda;
}

/**
 * Creates simulated Lambda functions from CloudFormation Resources.
 */
export class SimCfnLambdaFunctionCreator {
  private readonly lambda: SimLambda;
  private readonly propertiesParser =
    new SimCfnLambdaFunctionPropertiesParser();
  private readonly skips = new SimCfnLambdaCreationSkips();

  constructor(properties: SimCfnLambdaFunctionCreatorProperties) {
    this.lambda = properties.lambda;
  }

  /**
   * Create a simulated Lambda function from an AWS::Lambda::Function Resource.
   *
   * Where a real in-process handler backs this Resource, from an executable
   * binding or from the simulated ECR repository its image URI names, that
   * handler backs the function instead of the template code, so tests can step
   * through their actual handler while still deploying it through
   * CloudFormation.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    bindings?: readonly SimCfnExecutableResourceBinding[],
  ): Promise<SimLambdaFunction> {
    const functionProperties = this.propertiesParser.parse(
      resource,
      properties,
    );
    const codeInput = simCfnLambdaCodeInput({
      resource,
      functionProperties,
      bindings,
      containerImages: this.lambda.containerImages(),
    });

    const skipError = this.skips.beforeCreate(
      resource,
      functionProperties,
      codeInput,
    );
    if (skipError !== undefined) {
      throw skipError;
    }

    try {
      await this.lambda.createFunction({
        input: simCfnLambdaCreateFunctionInput(
          functionProperties,
          codeInput.code,
        ),
      });
    } catch (error) {
      const assetsSkipError = this.skips.fromCreateFailure(
        resource,
        functionProperties,
        error,
      );
      if (assetsSkipError !== undefined) {
        throw assetsSkipError;
      }

      throw error;
    }

    const simFunction = this.lambda.getSimFunctionByName(
      functionProperties.functionName,
    );
    assertDefined(
      simFunction,
      `Sim Lambda function ${functionProperties.functionName} after CloudFormation creation`,
    );

    return simFunction;
  }
}
