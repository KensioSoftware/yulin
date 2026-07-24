import type { Brand } from "../../../util/brand.type.js";
import type { SimAwsRunAsOwner } from "../../aws/caller/sim-aws-run-as-context.js";
import { simAwsRunAsContext } from "../../aws/caller/sim-aws-run-as-context.js";
import { simAwsAccountRegionScopeFactory } from "../../aws/sim-aws-account-region-scope.factory.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import {
  type SimLambdaExecutableCode,
  SimLambdaHandlerReferenceCode,
} from "./code/sim-lambda-executable-code.js";
import { SimLambdaHandlerRunner } from "./invoke/sim-lambda-handler-runner.js";
import { SimLambdaInvokeContextBuilder } from "./invoke/sim-lambda-invoke-context-builder.js";
import {
  defaultLambdaHandler,
  type SimLambdaHandler,
} from "./sim-lambda-handler.type.js";

export type SimLambdaFunctionName = Brand<string, "SimLambdaFunctionName">;

export const DEFAULT_SIM_LAMBDA_TIMEOUT_SECONDS = 3;
export const DEFAULT_SIM_LAMBDA_MEMORY_SIZE_MB = 128;

export type SimLambdaFunctionMap = Map<
  SimLambdaFunctionName,
  SimLambdaFunction
>;

export type SimLambdaFunctionState =
  "Pending" | "Active" | "Inactive" | "Failed";

/**
 * Lambda function ARNs address the function with a colon, not a slash.
 */
export type SimLambdaFunctionArn =
  `arn:aws:lambda:${string}:${string}:function:${string}`;

/**
 * Build the ARN a sim Lambda function has, or would have, in a scope.
 */
export function simLambdaFunctionArn(
  scope: SimAwsAccountRegionScope,
  name: string,
): SimLambdaFunctionArn {
  return `arn:aws:lambda:${scope.regionName}:${scope.accountId}:function:${name}`;
}

/**
 * Minimal structural Lambda function configuration, as returned by
 * CreateFunction and GetFunction.
 */
export interface SimLambdaFunctionConfiguration {
  FunctionName: string;
  FunctionArn: SimLambdaFunctionArn;
  Role: string;
  State: SimLambdaFunctionState;
  Version: string;
  Timeout: number;
  MemorySize: number;
  Handler?: string | undefined;
  Runtime?: string | undefined;
  Description?: string | undefined;
}

interface SimLambdaFunctionProperties {
  name: SimLambdaFunctionName | string;
  roleArn: string;
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  handlerFunction?: SimLambdaHandler;
  code?: SimLambdaExecutableCode | undefined;
  state?: SimLambdaFunctionState;
  handlerName?: string | undefined;
  runtimeName?: string | undefined;
  description?: string | undefined;
  timeoutSeconds?: number | undefined;
  memorySizeMb?: number | undefined;
  runAsOwner?: SimAwsRunAsOwner;
}

/**
 * Simulated Lambda function resource.
 *
 * The function executes a real handler function reference in-process. While
 * the handler runs, the function's execution Role is the ambient simulated
 * caller for the owning SimAws instance, so simulated AWS operations the
 * handler performs are attributed to the execution Role, as on real Lambda.
 */
export class SimLambdaFunction {
  public readonly name: SimLambdaFunctionName;
  public readonly roleArn: string;
  public readonly accountRegionScope: SimAwsAccountRegionScope;
  public readonly handlerName: string | undefined;
  public readonly runtimeName: string | undefined;
  public readonly description: string | undefined;
  public readonly timeoutSeconds: number;
  public readonly memorySizeMb: number;

  #state: SimLambdaFunctionState;
  private readonly code: SimLambdaExecutableCode;
  private readonly runAsOwner: SimAwsRunAsOwner;
  private readonly runner = new SimLambdaHandlerRunner();

  constructor(properties: SimLambdaFunctionProperties) {
    const {
      name,
      roleArn,
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      handlerFunction = defaultLambdaHandler,
      code,
      state = "Pending",
      handlerName,
      runtimeName,
      description,
      timeoutSeconds = DEFAULT_SIM_LAMBDA_TIMEOUT_SECONDS,
      memorySizeMb = DEFAULT_SIM_LAMBDA_MEMORY_SIZE_MB,
      runAsOwner = this,
    } = properties;
    this.name = name as SimLambdaFunctionName;
    this.roleArn = roleArn;
    this.accountRegionScope = accountRegionScope;
    this.code = code ?? new SimLambdaHandlerReferenceCode(handlerFunction);
    this.#state = state;
    this.handlerName = handlerName;
    this.runtimeName = runtimeName;
    this.description = description;
    this.timeoutSeconds = timeoutSeconds;
    this.memorySizeMb = memorySizeMb;
    this.runAsOwner = runAsOwner;
  }

  /**
   * Get the current state of this sim Lambda function.
   */
  get state(): SimLambdaFunctionState {
    return this.#state;
  }

  /**
   * Get the ARN for this sim Lambda function.
   */
  get arn(): SimLambdaFunctionArn {
    return simLambdaFunctionArn(this.accountRegionScope, this.name);
  }

  /**
   * Move this sim Lambda function to the Active state.
   */
  activate(): Promise<void> {
    this.#state = "Active";
    return Promise.resolve();
  }

  /**
   * Get the AWS-like function configuration for this sim Lambda function.
   */
  configuration(): SimLambdaFunctionConfiguration {
    return {
      FunctionName: this.name,
      FunctionArn: this.arn,
      Role: this.roleArn,
      State: this.state,
      Version: "$LATEST",
      Timeout: this.timeoutSeconds,
      MemorySize: this.memorySizeMb,
      Handler: this.handlerName,
      Runtime: this.runtimeName,
      Description: this.description,
    };
  }

  /**
   * Invoke this sim Lambda function's handler with an invocation event.
   *
   * The handler runs with this function's execution Role as the ambient
   * simulated caller for the run-as owner, which is the owning SimAws
   * instance when the function was created through one. Cold-start module
   * imports also run as the execution Role, as on real Lambda.
   *
   * Resolves with the handler result, or rejects with the handler or
   * Runtime.* cold-start error.
   */
  async invoke(event: unknown): Promise<unknown> {
    const contextBuilder = new SimLambdaInvokeContextBuilder({
      functionName: this.name,
      invokedFunctionArn: this.arn,
      timeoutSeconds: this.timeoutSeconds,
      memorySizeMb: this.memorySizeMb,
    });

    return await simAwsRunAsContext.run(
      this.runAsOwner,
      { kind: "arn", arn: this.roleArn },
      async () =>
        await this.runner.run(
          this.code.handlerFunction(),
          event,
          contextBuilder,
        ),
    );
  }
}
