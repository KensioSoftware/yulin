import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimLambdaResourceNotFoundException } from "../../error/sim-lambda.error.js";
import type {
  SimLambdaFunction,
  SimLambdaFunctionMap,
  SimLambdaFunctionName,
} from "../sim-lambda-function.js";
import {
  type SimLambdaFunctionArn,
  simLambdaFunctionArn,
} from "../sim-lambda-function-configuration.js";

interface SimLambdaFunctionLookupProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly functions: SimLambdaFunctionMap;
}

/**
 * Finds functions by name in one Account/Region scope, failing the way AWS
 * does when the name belongs to no function.
 *
 * Commands that act on something belonging to a function, such as its
 * Function URL, need this check before they can say anything about the thing
 * itself.
 */
export class SimLambdaFunctionLookup {
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly functions: SimLambdaFunctionMap;

  constructor(properties: SimLambdaFunctionLookupProperties) {
    this.accountRegionScope = properties.accountRegionScope;
    this.functions = properties.functions;
  }

  /**
   * Build the ARN a function has, or would have, in this scope, qualified by
   * the version or alias a request named.
   */
  functionArn(functionName: string, qualifier?: string): SimLambdaFunctionArn {
    return simLambdaFunctionArn(
      this.accountRegionScope,
      functionName,
      qualifier,
    );
  }

  /**
   * Get a function by name, or nothing when the name belongs to no function.
   */
  find(functionName: string): SimLambdaFunction | undefined {
    return this.functions.get(functionName as SimLambdaFunctionName);
  }

  /**
   * Get a function by name, or fail as AWS does when there is no such
   * function.
   */
  require(functionName: string): SimLambdaFunction {
    const simFunction = this.functions.get(
      functionName as SimLambdaFunctionName,
    );

    if (simFunction === undefined) {
      throw new SimLambdaResourceNotFoundException(
        `Function not found: ${this.functionArn(functionName)}`,
      );
    }

    return simFunction;
  }
}
