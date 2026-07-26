import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import {
  SimLambdaResourceConflictException,
  SimLambdaResourceNotFoundException,
} from "../../error/sim-lambda.error.js";
import type { SimLambdaUrlRegistry } from "../../registry/sim-lambda-url-registry.js";
import type {
  SimLambdaFunction,
  SimLambdaFunctionName,
} from "../sim-lambda-function.js";
import { SimLambdaFunctionUrlFactory } from "./sim-lambda-function-url-factory.js";
import type {
  SimLambdaFunctionUrl,
  SimLambdaFunctionUrlAuthType,
  SimLambdaFunctionUrlId,
  SimLambdaFunctionUrlInvokeMode,
  SimLambdaFunctionUrlMap,
} from "./sim-lambda-function-url.js";

interface SimLambdaFunctionUrlStoreProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly urlRegistry: SimLambdaUrlRegistry;
}

interface CreateSimLambdaFunctionUrlProperties {
  readonly simFunction: SimLambdaFunction;
  readonly authType?: SimLambdaFunctionUrlAuthType | undefined;
  readonly invokeMode?: SimLambdaFunctionUrlInvokeMode | undefined;
}

/**
 * Function URL state for one Account/Region scope of simulated Lambda.
 *
 * Each function has at most one Function URL, so URLs are held by function
 * name.
 */
export class SimLambdaFunctionUrlStore {
  private readonly functionUrls: SimLambdaFunctionUrlMap = new Map();
  private readonly factory: SimLambdaFunctionUrlFactory;

  constructor(properties: SimLambdaFunctionUrlStoreProperties) {
    this.factory = new SimLambdaFunctionUrlFactory(properties);
  }

  /**
   * Get a function's Function URL, if it has one.
   */
  get(functionName: string): SimLambdaFunctionUrl | undefined {
    return this.functionUrls.get(functionName as SimLambdaFunctionName);
  }

  /**
   * Get a function's Function URL, or fail as AWS does when it has none.
   */
  require(simFunction: SimLambdaFunction): SimLambdaFunctionUrl {
    const functionUrl = this.get(simFunction.name);

    if (functionUrl === undefined) {
      throw new SimLambdaResourceNotFoundException(
        `Function URL config not found for function: ${simFunction.arn}`,
      );
    }

    return functionUrl;
  }

  /**
   * Get every Function URL a function has, which is either none or one.
   */
  allForFunction(functionName: string): readonly SimLambdaFunctionUrl[] {
    const functionUrl = this.get(functionName);

    if (functionUrl === undefined) {
      return [];
    }

    return [functionUrl];
  }

  /**
   * Find a Function URL by the id in its hostname.
   */
  byUrlId(urlId: SimLambdaFunctionUrlId): SimLambdaFunctionUrl | undefined {
    return this.functionUrls
      .values()
      .find((functionUrl) => functionUrl.urlId === urlId);
  }

  /**
   * Create a Function URL for a function that does not have one.
   */
  create(
    properties: CreateSimLambdaFunctionUrlProperties,
  ): SimLambdaFunctionUrl {
    const { simFunction } = properties;

    if (this.get(simFunction.name) !== undefined) {
      throw new SimLambdaResourceConflictException(
        `FunctionUrlConfig exists for this Lambda function: ${simFunction.arn}`,
      );
    }

    const functionUrl = this.factory.make(properties);
    this.functionUrls.set(simFunction.name, functionUrl);

    return functionUrl;
  }

  /**
   * Delete a function's Function URL, so its hostname stops resolving.
   */
  delete(simFunction: SimLambdaFunction): void {
    const functionUrl = this.require(simFunction);

    this.functionUrls.delete(functionUrl.functionName);
    this.factory.forget(functionUrl);
  }
}
