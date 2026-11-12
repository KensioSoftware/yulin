import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simLambdaUnqualifiedFunctionOf } from "../../function/sim-lambda-function-reference.js";
import type {
  SimLambdaFunction,
  SimLambdaFunctionMap,
} from "../../function/sim-lambda-function.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import { FunctionUrlAuthorizer } from "../function-url/function-url-authorizer.js";
import { requiredString } from "../event-source-mapping/create-event-source-mapping-values.js";
import type {
  SimDeleteFunctionConcurrencyCommand,
  SimDeleteFunctionConcurrencyCommandOutput,
  SimGetFunctionConcurrencyCommand,
  SimGetFunctionConcurrencyCommandOutput,
  SimPutFunctionConcurrencyCommand,
  SimPutFunctionConcurrencyCommandOutput,
} from "./concurrency.command.js";
import { simLambdaReservedConcurrencyIn } from "./reserved-concurrency-limit.js";

interface SimLambdaConcurrencyCommandsProperties {
  readonly functions: SimLambdaFunctionLookup;
  readonly functionMap: SimLambdaFunctionMap;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
}

interface SimLambdaConcurrencyCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The reserved concurrency commands of one simulated Lambda scope.
 *
 * Each names a function, authorizes the IAM action of its own name against
 * the function's ARN, and reads or changes the reservation the function and
 * every version of it share.
 */
export class SimLambdaConcurrencyCommands {
  private readonly properties: SimLambdaConcurrencyCommandsProperties;

  constructor(properties: SimLambdaConcurrencyCommandsProperties) {
    this.properties = properties;
  }

  /**
   * Reserve concurrency for a function.
   */
  async put(
    command: SimPutFunctionConcurrencyCommand,
    options?: SimLambdaConcurrencyCommandOptions,
  ): Promise<SimPutFunctionConcurrencyCommandOutput> {
    const simFunction = await this.named(
      "lambda:PutFunctionConcurrency",
      command.input.FunctionName,
      options,
    );
    const reserved = simLambdaReservedConcurrencyIn(
      command.input.ReservedConcurrentExecutions,
      simFunction,
      this.properties.functionMap.values(),
    );

    simFunction.concurrency.reserve(reserved);

    return { $metadata: {}, ReservedConcurrentExecutions: reserved };
  }

  /**
   * Read a function's reserved concurrency.
   */
  async get(
    command: SimGetFunctionConcurrencyCommand,
    options?: SimLambdaConcurrencyCommandOptions,
  ): Promise<SimGetFunctionConcurrencyCommandOutput> {
    const simFunction = await this.named(
      "lambda:GetFunctionConcurrency",
      command.input.FunctionName,
      options,
    );

    return {
      $metadata: {},
      ReservedConcurrentExecutions: simFunction.concurrency.reserved,
    };
  }

  /**
   * Remove a function's reserved concurrency.
   */
  async delete(
    command: SimDeleteFunctionConcurrencyCommand,
    options?: SimLambdaConcurrencyCommandOptions,
  ): Promise<SimDeleteFunctionConcurrencyCommandOutput> {
    const simFunction = await this.named(
      "lambda:DeleteFunctionConcurrency",
      command.input.FunctionName,
      options,
    );

    simFunction.concurrency.reserve(undefined);

    return { $metadata: {} };
  }

  private async named(
    action: string,
    requested: string | undefined,
    options?: SimLambdaConcurrencyCommandOptions,
  ): Promise<SimLambdaFunction> {
    const functionName = simLambdaUnqualifiedFunctionOf(
      requiredString(requested, "functionName"),
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.properties.background.sequence();

    const { functions, iam } = this.properties;
    new FunctionUrlAuthorizer({ iam, action }).authorize(
      functions.functionArn(functionName),
      options?.caller,
    );

    return functions.require(functionName);
  }
}
