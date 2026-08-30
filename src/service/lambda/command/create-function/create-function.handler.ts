import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsRunAsOwner } from "../../../aws/caller/sim-aws-run-as-context.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimLambdaResourceConflictException } from "../../error/sim-lambda.error.js";
import type { SimLambdaExecutableCode } from "../../function/code/sim-lambda-executable-code.js";
import { SimLambdaCodeResolver } from "../../function/code/sim-lambda-code-resolver.js";
import type { SimLambdaContainerImages } from "../../function/code/image/sim-lambda-container-images.js";
import type { SimLambdaCodeStore } from "../../function/code/store/sim-lambda-code-store.js";
import type { SimLambdaVmSdkModuleProvider } from "../../function/code/vm/sdk/sim-lambda-vm-sdk-module-provider.js";
import type { SimCloudWatchServiceWriter } from "../../../cloudwatch/write/sim-cloudwatch-service-writer.js";
import type { SimLogsServiceWriter } from "../../../logs/write/sim-logs-service-writer.js";
import type { SimLambdaOutboundHttp } from "../../function/outbound/sim-lambda-outbound-http.js";
import { SimLambdaEnvironmentConflicts } from "../../function/environment/sim-lambda-environment-conflicts.js";
import { SimLambdaEnvironment } from "../../function/environment/sim-lambda-environment.js";
import {
  SimLambdaFunction,
  type SimLambdaFunctionMap,
  type SimLambdaFunctionName,
} from "../../function/sim-lambda-function.js";
import {
  DEFAULT_SIM_LAMBDA_MEMORY_SIZE_MB,
  simLambdaFunctionArn,
} from "../../function/sim-lambda-function-configuration.js";
import { CreateFunctionAuthorizer } from "./create-function-authorizer.js";
import {
  type CreateFunctionInput,
  requireCreateFunctionInput,
} from "./create-function-input.js";
import type {
  SimCreateFunctionCommand,
  SimCreateFunctionCommandOutput,
} from "./create-function.command.js";

interface CreateFunctionCommandHandlerProperties {
  accountRegionScope: SimAwsAccountRegionScope;
  functions: SimLambdaFunctionMap;
  runAsOwner: SimAwsRunAsOwner;
  iam?: SimIamInterServiceAuthZ;
  background?: BackgroundScheduler;
  codeStore?: SimLambdaCodeStore | undefined;
  containerImages?: SimLambdaContainerImages | undefined;
  vmSdkModuleProvider?: SimLambdaVmSdkModuleProvider | undefined;
  environmentConflicts?: SimLambdaEnvironmentConflicts;
  logs?: SimLogsServiceWriter | undefined;
  metrics?: SimCloudWatchServiceWriter | undefined;
  outboundHttp?: SimLambdaOutboundHttp | undefined;
}

interface CreateFunctionCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated Lambda CreateFunctionCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/CreateFunctionCommand/
 */
export class CreateFunctionCommandHandler implements CommandHandler<
  SimCreateFunctionCommand,
  SimCreateFunctionCommandOutput
> {
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly functions: SimLambdaFunctionMap;
  private readonly runAsOwner: SimAwsRunAsOwner;
  private readonly authorizer: CreateFunctionAuthorizer;
  private readonly background: BackgroundScheduler;
  private readonly codeResolver: SimLambdaCodeResolver;
  private readonly environmentConflicts: SimLambdaEnvironmentConflicts;
  private readonly logs: SimLogsServiceWriter | undefined;
  private readonly metrics: SimCloudWatchServiceWriter | undefined;
  private readonly outboundHttp: SimLambdaOutboundHttp | undefined;

  constructor(properties: CreateFunctionCommandHandlerProperties) {
    const {
      accountRegionScope,
      functions,
      runAsOwner,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
      codeStore,
      containerImages,
      vmSdkModuleProvider,
      environmentConflicts = new SimLambdaEnvironmentConflicts(),
      logs,
      metrics,
      outboundHttp,
    } = properties;
    this.accountRegionScope = accountRegionScope;
    this.functions = functions;
    this.runAsOwner = runAsOwner;
    this.authorizer = new CreateFunctionAuthorizer({ iam });
    this.background = background;
    this.codeResolver = new SimLambdaCodeResolver({
      codeStore,
      containerImages,
      vmSdkModuleProvider,
      outboundHttp,
      // The background scheduler is this simulation's clock, and the same one
      // the created function is given.
      clock: background,
    });
    this.environmentConflicts = environmentConflicts;
    this.logs = logs;
    this.metrics = metrics;
    this.outboundHttp = outboundHttp;
  }

  /**
   * Create a sim Lambda function.
   */
  async handle(
    command: SimCreateFunctionCommand,
    options?: CreateFunctionCommandHandlerOptions,
  ): Promise<SimCreateFunctionCommandOutput> {
    const input = requireCreateFunctionInput(command);

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const functionArn = simLambdaFunctionArn(
      this.accountRegionScope,
      input.name,
    );
    this.authorizer.authorize(functionArn, input.roleArn, options?.caller);

    this.requireAvailableFunctionName(input.name, functionArn);

    const environment = this.makeEnvironment(input);
    const code = await this.resolveCode(input, environment, options?.caller);

    // Re-check after resolving code: a concurrent create for the same name
    // may have completed while awaiting an S3 code fetch, and must not be
    // overwritten.
    this.requireAvailableFunctionName(input.name, functionArn);

    // Compared against the functions that already exist, so this has to
    // happen before the new one joins them.
    this.environmentConflicts.check(
      environment,
      this.functions.values().map((existing) => existing.environment),
    );

    const simFunction = new SimLambdaFunction({
      ...input,
      code,
      environment,
      accountRegionScope: this.accountRegionScope,
      runAsOwner: this.runAsOwner,
      clock: this.background,
      logs: this.logs,
      metrics: this.metrics,
      outboundHttp: this.outboundHttp,
    });

    this.functions.set(simFunction.name, simFunction);

    // New function becomes Active async in the background.
    this.background.schedule(() => simFunction.activate());

    return {
      $metadata: {},
      ...simFunction.configuration(),
    };
  }

  /**
   * Ensure no sim Lambda function already has the given name.
   */
  private requireAvailableFunctionName(
    name: string,
    functionArn: string,
  ): void {
    if (this.functions.has(name as SimLambdaFunctionName)) {
      throw new SimLambdaResourceConflictException(
        `Function already exist: ${functionArn}`,
      );
    }
  }

  /**
   * Build the environment the new function will run with.
   *
   * Built before the function itself, because vm zip code takes the
   * environment at creation to put in its sandbox.
   */
  private makeEnvironment(input: CreateFunctionInput): SimLambdaEnvironment {
    return new SimLambdaEnvironment({
      functionName: input.name,
      regionName: this.accountRegionScope.regionName,
      memorySizeMb: input.memorySizeMb ?? DEFAULT_SIM_LAMBDA_MEMORY_SIZE_MB,
      declaredVariables: input.environmentVariables,
    });
  }

  /**
   * Resolve the validated code source into executable code, fetching
   * S3-located code as the creating caller.
   */
  private async resolveCode(
    input: CreateFunctionInput,
    environment: SimLambdaEnvironment,
    caller: SimAwsCaller | undefined,
  ): Promise<SimLambdaExecutableCode> {
    return await this.codeResolver.resolve(input.codeSource, {
      handlerName: input.handlerName,
      environment,
      caller,
    });
  }
}
