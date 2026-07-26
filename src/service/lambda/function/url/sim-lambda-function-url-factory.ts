import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimLambdaUrlRegistry } from "../../registry/sim-lambda-url-registry.js";
import type { SimLambdaFunction } from "../sim-lambda-function.js";
import {
  SimLambdaFunctionUrl,
  type SimLambdaFunctionUrlAuthType,
  type SimLambdaFunctionUrlInvokeMode,
} from "./sim-lambda-function-url.js";

interface SimLambdaFunctionUrlFactoryProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly urlRegistry: SimLambdaUrlRegistry;
}

interface MakeSimLambdaFunctionUrlProperties {
  readonly simFunction: SimLambdaFunction;
  readonly authType?: SimLambdaFunctionUrlAuthType | undefined;
  readonly invokeMode?: SimLambdaFunctionUrlInvokeMode | undefined;
}

/**
 * Builds Function URLs, taking their ids from the cross-Account registry.
 *
 * Allocating and registering the id belong together: an id that is not
 * registered names a URL the serving layer cannot route to.
 */
export class SimLambdaFunctionUrlFactory {
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly urlRegistry: SimLambdaUrlRegistry;

  constructor(properties: SimLambdaFunctionUrlFactoryProperties) {
    this.accountRegionScope = properties.accountRegionScope;
    this.urlRegistry = properties.urlRegistry;
  }

  /**
   * Make a registered Function URL for a function.
   */
  make(properties: MakeSimLambdaFunctionUrlProperties): SimLambdaFunctionUrl {
    const { simFunction, authType, invokeMode } = properties;
    const urlId = this.urlRegistry.allocateFunctionUrlId();

    this.urlRegistry.registerFunctionUrl(
      urlId,
      this.accountRegionScope.accountId,
    );

    return new SimLambdaFunctionUrl({
      urlId,
      functionName: simFunction.name,
      functionArn: simFunction.arn,
      accountRegionScope: this.accountRegionScope,
      authType,
      invokeMode,
    });
  }

  /**
   * Forget a Function URL id, so its hostname stops resolving.
   */
  forget(functionUrl: SimLambdaFunctionUrl): void {
    this.urlRegistry.deregisterFunctionUrl(functionUrl.urlId);
  }
}
