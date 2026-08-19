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
import { InvokeAuthorizer } from "./invoke-authorizer.js";
import { SimLambdaInvocationDispatcher } from "./invoke-dispatcher.js";
import type {
  SimInvokeCommand,
  SimInvokeCommandOutput,
} from "./invoke.command.js";

interface InvokeCommandHandlerProperties {
  accountRegionScope: SimAwsAccountRegionScope;
  functions: SimLambdaFunctionMap;
  versions: SimLambdaFunctionVersionStore;
  iam?: SimIamInterServiceAuthZ;
  background?: BackgroundScheduler;
}

interface InvokeCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated Lambda InvokeCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/InvokeCommand/
 */
export class InvokeCommandHandler implements CommandHandler<
  SimInvokeCommand,
  SimInvokeCommandOutput
> {
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly functions: SimLambdaFunctionMap;
  private readonly versions: SimLambdaFunctionVersionStore;
  private readonly authorizer: InvokeAuthorizer;
  private readonly background: BackgroundScheduler;
  private readonly dispatcher: SimLambdaInvocationDispatcher;

  constructor(properties: InvokeCommandHandlerProperties) {
    const {
      accountRegionScope,
      functions,
      versions,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;
    this.accountRegionScope = accountRegionScope;
    this.functions = functions;
    this.versions = versions;
    this.authorizer = new InvokeAuthorizer({ iam });
    this.background = background;
    this.dispatcher = new SimLambdaInvocationDispatcher({ background });
  }

  /**
   * Invoke a sim Lambda function, or the version a qualifier names.
   *
   * The qualifier comes from the request's own `Qualifier` or from the
   * function name it was addressed to, and an alias resolves to the version it
   * points at.
   */
  async handle(
    command: SimInvokeCommand,
    options?: InvokeCommandHandlerOptions,
  ): Promise<SimInvokeCommandOutput> {
    assertDefined(
      command.input.FunctionName,
      "InvokeCommand.input.FunctionName required",
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
    const simFunction = this.functions.get(
      functionName as SimLambdaFunctionName,
    );

    // Looked up before authorizing, because the function's own resource policy
    // is part of what decides the answer, but still reported as missing only
    // after authorization, as AWS orders the two. Authorization is against the
    // function rather than the version, since a resource policy statement is
    // not qualified here yet.
    this.authorizer.authorize(functionArn, options?.caller, simFunction);

    if (simFunction === undefined) {
      throw new SimLambdaResourceNotFoundException(
        `Function not found: ${functionArn}`,
      );
    }

    return await this.dispatcher.dispatch(
      this.versions.require(simFunction, qualifier),
      command,
    );
  }
}
