import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimLambdaResourceNotFoundException } from "../../error/sim-lambda.error.js";
import { simLambdaQualifiedFunctionOf } from "../../function/sim-lambda-function-reference.js";
import type { SimLambdaFunctionVersionStore } from "../../function/version/sim-lambda-function-version-store.js";
import type {
  SimLambdaFunctionMap,
  SimLambdaFunctionName,
} from "../../function/sim-lambda-function.js";
import { simLambdaFunctionArn } from "../../function/sim-lambda-function-configuration.js";
import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import { simLambdaGetFunctionTags } from "./get-function-tags.js";
import {
  GetFunctionAuthorizer,
  type GetFunctionAuthorizerAction,
} from "./get-function-authorizer.js";
import type {
  SimGetFunctionCommand,
  SimGetFunctionCommandOutput,
} from "./get-function.command.js";

interface GetFunctionCommandHandlerProperties {
  accountRegionScope: SimAwsAccountRegionScope;
  functions: SimLambdaFunctionMap;
  versions: SimLambdaFunctionVersionStore;
  iam?: SimIamInterServiceAuthZ;
  background?: BackgroundScheduler;
  /**
   * The IAM action the read is authorized as, which is what tells GetFunction
   * apart from GetFunctionConfiguration.
   */
  action?: GetFunctionAuthorizerAction | undefined;
}

/**
 * The function a read names, and the version of it the qualifier picks.
 *
 * They differ for a qualified read: the version carries the configuration, and
 * the function carries what belongs to it whatever the version, such as its
 * tags.
 */
interface GetFunctionResolved {
  readonly simFunction: SimLambdaFunction;
  readonly version: SimLambdaFunction;
}

interface GetFunctionCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated Lambda GetFunctionCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/GetFunctionCommand/
 */
export class GetFunctionCommandHandler implements CommandHandler<
  SimGetFunctionCommand,
  SimGetFunctionCommandOutput
> {
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly functions: SimLambdaFunctionMap;
  private readonly versions: SimLambdaFunctionVersionStore;
  private readonly authorizer: GetFunctionAuthorizer;
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly background: BackgroundScheduler;

  constructor(properties: GetFunctionCommandHandlerProperties) {
    const {
      accountRegionScope,
      functions,
      versions,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
      action,
    } = properties;
    this.accountRegionScope = accountRegionScope;
    this.functions = functions;
    this.versions = versions;
    this.authorizer = new GetFunctionAuthorizer({ iam, action });
    this.iam = iam;
    this.background = background;
  }

  /**
   * Get a sim Lambda function's configuration, or that of the version a
   * qualifier names.
   */
  async handle(
    command: SimGetFunctionCommand,
    options?: GetFunctionCommandHandlerOptions,
  ): Promise<SimGetFunctionCommandOutput> {
    const { simFunction, version } = await this.resolve(command, options);

    return {
      $metadata: {},
      Configuration: version.configuration(),
      ...simLambdaGetFunctionTags(this.iam, simFunction, options?.caller),
    };
  }

  /**
   * Authorize a read of a function, and find the function and the version of
   * it the request names.
   */
  async resolve(
    command: SimGetFunctionCommand,
    options?: GetFunctionCommandHandlerOptions,
    commandName = "GetFunctionCommand",
  ): Promise<GetFunctionResolved> {
    assertDefined(
      command.input.FunctionName,
      `${commandName}.input.FunctionName required`,
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const { functionName, qualifier } = simLambdaQualifiedFunctionOf(
      command.input.FunctionName,
      command.input.Qualifier,
    );
    const functionArn = simLambdaFunctionArn(
      this.accountRegionScope,
      functionName,
    );
    this.authorizer.authorize(functionArn, options?.caller);

    const simFunction = this.functions.get(
      functionName as SimLambdaFunctionName,
    );
    if (simFunction === undefined) {
      throw new SimLambdaResourceNotFoundException(
        `Function not found: ${functionArn}`,
      );
    }

    return {
      simFunction,
      version: this.versions.require(simFunction, qualifier),
    };
  }
}
