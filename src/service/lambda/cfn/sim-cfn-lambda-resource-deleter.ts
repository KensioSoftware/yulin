import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimLambda } from "../sim-lambda.js";
import type { SimLambdaFunction } from "../function/sim-lambda-function.js";
import type { SimLambdaFunctionUrl } from "../function/url/sim-lambda-function-url.js";
import type { SimLambdaEventSourceMapping } from "../event-source/sim-lambda-event-source-mapping.js";
import type { SimLambdaPermission } from "../function/policy/sim-lambda-permission.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import { simCfnLambdaTargetFunctionName } from "./function/sim-cfn-lambda-target-function.js";

interface SimCfnLambdaResourceDeleterProperties {
  readonly lambda: SimLambda;
}

/**
 * Deletes the simulated Lambda resources a CloudFormation Stack created.
 *
 * Each Resource type is addressed by what its creation produced, so a URL and a
 * permission are removed from the function they were put on rather than from
 * the function name the template happened to write.
 */
export class SimCfnLambdaResourceDeleter {
  private readonly lambda: SimLambda;

  constructor(properties: SimCfnLambdaResourceDeleterProperties) {
    this.lambda = properties.lambda;
  }

  /**
   * Delete a simulated Lambda resource created from a CloudFormation Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
  ): Promise<void> {
    switch (resourceTypeName) {
      case "Function": {
        await this.deleteFunction(resource);
        return;
      }
      case "Url": {
        await this.deleteFunctionUrl(resource);
        return;
      }
      case "EventSourceMapping": {
        await this.deleteEventSourceMapping(resource);
        return;
      }
      case "Permission": {
        await this.removePermission(resource);
        return;
      }
      default: {
        throw new Error(
          `Unsupported sim Lambda CloudFormation Resource ${resourceTypeName} deletion`,
        );
      }
    }
  }

  private async deleteFunction(resource: SimCfnResource): Promise<void> {
    const simFunction = resource.simResource as SimLambdaFunction | undefined;
    assertDefined(
      simFunction,
      `sim Lambda Function for CloudFormation Resource ${resource.logicalId}`,
    );

    await this.lambda.deleteFunction({
      input: { FunctionName: simFunction.name },
    });
  }

  private async deleteFunctionUrl(resource: SimCfnResource): Promise<void> {
    const functionUrl = resource.simResource as
      SimLambdaFunctionUrl | undefined;
    assertDefined(
      functionUrl,
      `sim Lambda Function URL for CloudFormation Resource ${resource.logicalId}`,
    );

    await this.lambda.deleteFunctionUrlConfig({
      input: { FunctionName: functionUrl.functionName },
    });
  }

  private async deleteEventSourceMapping(
    resource: SimCfnResource,
  ): Promise<void> {
    const mapping = resource.simResource as
      SimLambdaEventSourceMapping | undefined;
    assertDefined(
      mapping,
      `sim Lambda event source mapping for CloudFormation Resource ${resource.logicalId}`,
    );

    await this.lambda.deleteEventSourceMapping({
      input: { UUID: mapping.uuid },
    });
  }

  /**
   * Take a permission back off the function it was added to.
   *
   * The statement is named after the Resource's logical ID when it is added,
   * because AWS::Lambda::Permission has no StatementId property, so that is
   * what addresses it again here.
   */
  private async removePermission(resource: SimCfnResource): Promise<void> {
    const permission = resource.simResource as SimLambdaPermission | undefined;
    assertDefined(
      permission,
      `sim Lambda permission for CloudFormation Resource ${resource.logicalId}`,
    );

    await this.lambda.removePermission({
      input: {
        FunctionName: simCfnLambdaTargetFunctionName(permission.resourceArn),
        StatementId: permission.statementId,
      },
    });
  }
}
