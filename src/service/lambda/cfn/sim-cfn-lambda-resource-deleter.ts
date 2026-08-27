import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimLambda } from "../sim-lambda.js";
import type { SimLambdaFunction } from "../function/sim-lambda-function.js";
import type { SimLambdaFunctionUrl } from "../function/url/sim-lambda-function-url.js";
import type { SimLambdaEventSourceMapping } from "../event-source/sim-lambda-event-source-mapping.js";
import type { SimLambdaFunctionAlias } from "../function/version/sim-lambda-function-alias.js";
import { simCfnLambdaCreatedResource as created } from "./sim-cfn-lambda-created-resource.js";
import { simCfnLambdaRemoveEventInvokeConfig } from "./event-invoke-config/sim-cfn-lambda-event-invoke-config-remover.js";
import { simCfnLambdaRevokePermission } from "./permission/sim-cfn-lambda-permission-revoker.js";
import { simCfnLambdaTargetFunctionName } from "./function/sim-cfn-lambda-target-function.js";
import type { SimCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

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
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    switch (resourceTypeName) {
      case "Function": {
        const { name } = created<SimLambdaFunction>(resource, "function");

        await this.lambda.deleteFunction(
          { input: { FunctionName: name } },
          options,
        );
        return;
      }
      case "Url": {
        const url = created<SimLambdaFunctionUrl>(resource, "Function URL");

        await this.lambda.deleteFunctionUrlConfig(
          { input: { FunctionName: url.functionName } },
          options,
        );
        return;
      }
      case "EventSourceMapping": {
        const { uuid } = created<SimLambdaEventSourceMapping>(
          resource,
          "event source mapping",
        );

        await this.lambda.deleteEventSourceMapping(
          { input: { UUID: uuid } },
          options,
        );
        return;
      }
      case "EventInvokeConfig": {
        await simCfnLambdaRemoveEventInvokeConfig(
          this.lambda,
          resource,
          options,
        );
        return;
      }
      case "Permission": {
        await simCfnLambdaRevokePermission(this.lambda, resource, options);
        return;
      }
      case "Version": {
        // Nothing to do. Lambda has no operation that deletes one published
        // version, and a version goes when the function it was published from
        // does. A Stack that published one is tearing that function down in
        // the same teardown, so leaving the version alone here leaves it
        // reachable for exactly as long as the function is.
        return;
      }
      case "Alias": {
        // The version the alias pointed at is left where it is.
        const alias = created<SimLambdaFunctionAlias>(resource, "alias");

        await this.lambda.deleteAlias(
          {
            input: {
              FunctionName: simCfnLambdaTargetFunctionName(alias.arn),
              Name: alias.name,
            },
          },
          options,
        );
        return;
      }
      default: {
        throw new Error(
          `Unsupported sim Lambda CloudFormation Resource ${resourceTypeName} deletion`,
        );
      }
    }
  }
}
