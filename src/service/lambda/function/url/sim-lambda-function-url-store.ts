import { SimLambdaResourceConflictException } from "../../error/sim-lambda.error.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimLambdaFunction } from "../sim-lambda-function.js";
import { simLambdaFunctionArn } from "../sim-lambda-function-configuration.js";
import {
  type MakeSimLambdaFunctionUrlProperties,
  SimLambdaFunctionUrlFactory,
  type SimLambdaFunctionUrlFactoryProperties,
} from "./sim-lambda-function-url-factory.js";
import type {
  SimLambdaFunctionUrl,
  SimLambdaFunctionUrlId,
  SimLambdaFunctionUrlMap,
} from "./sim-lambda-function-url.js";

/**
 * Function URL state for one Account/Region scope of simulated Lambda.
 *
 * A function has at most one Function URL of its own, and at most one for
 * each of its aliases, so URLs are held by function name and alias.
 */
export class SimLambdaFunctionUrlStore {
  private readonly functionUrls: SimLambdaFunctionUrlMap = new Map();
  private readonly factory: SimLambdaFunctionUrlFactory;
  private readonly scope: SimAwsAccountRegionScope;

  // The store's construction inputs are exactly the factory's: it holds URL
  // state and forwards the wiring straight through.
  constructor(properties: SimLambdaFunctionUrlFactoryProperties) {
    this.factory = new SimLambdaFunctionUrlFactory(properties);
    this.scope = properties.accountRegionScope;
  }

  /**
   * Get the Function URL of a function, or of one of its aliases, if there is
   * one.
   */
  get(
    functionName: string,
    qualifier?: string,
  ): SimLambdaFunctionUrl | undefined {
    return this.functionUrls.get(
      simLambdaFunctionArn(this.scope, functionName, qualifier),
    );
  }

  /**
   * Get every Function URL a function has, its own and its aliases'.
   */
  allForFunction(functionName: string): readonly SimLambdaFunctionUrl[] {
    return this.functionUrls
      .values()
      .filter((functionUrl) => functionUrl.functionName === functionName)
      .toArray();
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
   * Create a Function URL for a function or alias that does not have one.
   */
  create(properties: MakeSimLambdaFunctionUrlProperties): SimLambdaFunctionUrl {
    const { simFunction, qualifier } = properties;
    if (this.get(simFunction.name, qualifier) !== undefined) {
      throw new SimLambdaResourceConflictException(
        `FunctionUrlConfig exists for this Lambda function: ${simFunction.arn}`,
      );
    }

    const functionUrl = this.factory.make(properties);
    this.functionUrls.set(functionUrl.functionArn, functionUrl);

    return functionUrl;
  }

  /**
   * Delete every Function URL a function has, its aliases' included.
   *
   * Deleting a function takes its URLs with it, and a function without one is
   * not an error there the way a DeleteFunctionUrlConfig request is.
   */
  deleteAllForFunction(simFunction: SimLambdaFunction): void {
    for (const functionUrl of this.allForFunction(simFunction.name)) {
      this.delete(functionUrl);
    }
  }

  /**
   * Delete a Function URL, so its hostname stops resolving.
   */
  delete(functionUrl: SimLambdaFunctionUrl): void {
    this.functionUrls.delete(functionUrl.functionArn);
    this.factory.forget(functionUrl);
  }
}
