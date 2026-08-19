import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import type { SimLambda } from "../../sim-lambda.js";
import { SimCfnLambdaPropertyParser } from "../function/sim-cfn-lambda-property-parser.js";
import { simCfnLambdaTargetFunctionName } from "../function/sim-cfn-lambda-target-function.js";

interface SimCfnLambdaVersionCreatorProperties {
  readonly lambda: SimLambda;
}

/**
 * Creates published Lambda versions from CloudFormation Resources.
 *
 * This is what CDK emits for `fn.currentVersion`, and what every
 * `lambda.Alias` sits on top of, so a synthesized template is the usual way a
 * version comes into existence outside a direct SDK call. Deploying one
 * publishes the function as it stands, exactly as a `PublishVersion` call
 * would, so the version carries the code the Stack deployed.
 *
 * `CodeSha256` and `RuntimePolicy` are not simulated. Neither changes what a
 * version is here, so a template carrying them publishes the same version as
 * one that does not.
 */
export class SimCfnLambdaVersionCreator {
  private readonly lambda: SimLambda;
  private readonly propertyParser = new SimCfnLambdaPropertyParser();

  constructor(properties: SimCfnLambdaVersionCreatorProperties) {
    this.lambda = properties.lambda;
  }

  /**
   * Publish a version from an AWS::Lambda::Version Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimLambdaFunction> {
    const functionName = simCfnLambdaTargetFunctionName(
      this.propertyParser.requiredString(
        resource,
        properties["FunctionName"],
        "FunctionName",
      ),
    );

    const published = await this.lambda.publishVersion({
      input: {
        FunctionName: functionName,
        Description: this.propertyParser.optionalString(
          resource,
          properties["Description"],
          "Description",
        ),
      },
    });

    const version = this.lambda.getSimFunctionTarget(
      functionName,
      published.Version,
    )?.simFunction;

    assertDefined(
      version,
      `Sim Lambda version ${published.Version} of ${functionName} after ` +
        "CloudFormation creation",
    );

    return version;
  }
}
