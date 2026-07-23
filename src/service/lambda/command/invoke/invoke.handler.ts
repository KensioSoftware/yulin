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
import {
  type SimLambdaFunctionMap,
  type SimLambdaFunctionName,
  simLambdaFunctionArn,
} from "../../function/sim-lambda-function.js";
import { InvokeAuthorizer } from "./invoke-authorizer.js";
import { SimLambdaInvocationDispatcher } from "./invoke-dispatcher.js";
import type { SimInvokeCommand, SimInvokeCommandOutput } from "./invoke.cmd.js";

interface InvokeCommandHandlerProperties {
  accountRegionScope: SimAwsAccountRegionScope;
  functions: SimLambdaFunctionMap;
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
  private readonly authorizer: InvokeAuthorizer;
  private readonly background: BackgroundScheduler;
  private readonly dispatcher: SimLambdaInvocationDispatcher;

  constructor(properties: InvokeCommandHandlerProperties) {
    const {
      accountRegionScope,
      functions,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;
    this.accountRegionScope = accountRegionScope;
    this.functions = functions;
    this.authorizer = new InvokeAuthorizer({ iam });
    this.background = background;
    this.dispatcher = new SimLambdaInvocationDispatcher({ background });
  }

  /**
   * Invoke a sim Lambda function.
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

    const functionArn = simLambdaFunctionArn(
      this.accountRegionScope,
      command.input.FunctionName,
    );
    this.authorizer.authorize(functionArn, options?.caller);

    const simFunction = this.functions.get(
      command.input.FunctionName as SimLambdaFunctionName,
    );
    if (simFunction === undefined) {
      throw new SimLambdaResourceNotFoundException(
        `Function not found: ${functionArn}`,
      );
    }

    return await this.dispatcher.dispatch(simFunction, command);
  }
}
