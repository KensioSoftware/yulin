import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import { SimCfnLambdaCdkAssetsSkip } from "./sim-cfn-lambda-cdk-assets-skip.js";
import type { SimCfnLambdaFunctionProperties } from "./sim-cfn-lambda-function-properties-parser.js";
import { SimCfnLambdaImageSkip } from "./sim-cfn-lambda-image-skip.js";
import { SimCfnLambdaRuntimeSkip } from "./sim-cfn-lambda-runtime-skip.js";

/**
 * The reasons an AWS::Lambda::Function Resource is skipped rather than created.
 *
 * Some are known before anything is attempted, from what the template
 * declares. One is only known from the failure creating the function produced.
 * Gathering them here keeps the creator to orchestrating the creation itself.
 */
export class SimCfnLambdaCreationSkips {
  private readonly imageSkip = new SimCfnLambdaImageSkip();
  private readonly runtimeSkip = new SimCfnLambdaRuntimeSkip();
  private readonly cdkAssetsSkip = new SimCfnLambdaCdkAssetsSkip();

  /**
   * The reason this Resource cannot be created, before anything is created.
   *
   * The image gate goes first because it is the more specific reason: a
   * container image function declares no Runtime, so the runtime gate would
   * pass it through with nothing to say.
   */
  beforeCreate(
    resource: SimCfnResource,
    functionProperties: SimCfnLambdaFunctionProperties,
    bound: boolean,
  ): Error | undefined {
    return (
      this.imageSkip.findSkipError(resource, functionProperties, bound) ??
      this.runtimeSkip.findSkipError(resource, functionProperties, bound)
    );
  }

  /**
   * The reason a creation failure is a skip rather than a stack failure.
   */
  fromCreateFailure(
    resource: SimCfnResource,
    functionProperties: SimCfnLambdaFunctionProperties,
    error: unknown,
  ): Error | undefined {
    return this.cdkAssetsSkip.findSkipError(
      resource,
      functionProperties,
      error,
    );
  }
}
