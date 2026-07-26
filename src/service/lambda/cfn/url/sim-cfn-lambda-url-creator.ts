import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type {
  SimLambdaFunctionUrl,
  SimLambdaFunctionUrlAuthType,
  SimLambdaFunctionUrlInvokeMode,
} from "../../function/url/sim-lambda-function-url.js";
import type { SimLambda } from "../../sim-lambda.js";
import { SimCfnLambdaPropertyParser } from "../function/sim-cfn-lambda-property-parser.js";
import { simCfnLambdaTargetFunctionName } from "../function/sim-cfn-lambda-target-function.js";

interface SimCfnLambdaUrlCreatorProperties {
  readonly lambda: SimLambda;
}

/**
 * Creates simulated Lambda Function URLs from CloudFormation Resources.
 *
 * This is the resource CDK's `Function.addFunctionUrl()` emits, so a deployed
 * template is the usual way a Function URL comes into existence outside a
 * direct SDK call.
 */
export class SimCfnLambdaUrlCreator {
  private readonly lambda: SimLambda;
  private readonly propertyParser = new SimCfnLambdaPropertyParser();

  constructor(properties: SimCfnLambdaUrlCreatorProperties) {
    this.lambda = properties.lambda;
  }

  /**
   * Create a simulated Function URL from an AWS::Lambda::Url Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimLambdaFunctionUrl> {
    const targetFunctionArn = this.propertyParser.requiredString(
      resource,
      properties["TargetFunctionArn"],
      "TargetFunctionArn",
    );
    const functionName = simCfnLambdaTargetFunctionName(targetFunctionArn);

    await this.lambda.createFunctionUrlConfig({
      input: {
        FunctionName: functionName,
        AuthType: this.propertyParser.requiredString(
          resource,
          properties["AuthType"],
          "AuthType",
        ) as SimLambdaFunctionUrlAuthType,
        InvokeMode: this.propertyParser.optionalString(
          resource,
          properties["InvokeMode"],
          "InvokeMode",
        ) as SimLambdaFunctionUrlInvokeMode | undefined,
      },
    });

    const functionUrl = this.lambda.getSimFunctionUrl(functionName);
    assertDefined(
      functionUrl,
      `Sim Lambda Function URL for ${functionName} after CloudFormation creation`,
    );

    return functionUrl;
  }
}
