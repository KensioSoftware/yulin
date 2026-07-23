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
import {
  SimLambdaFunction,
  type SimLambdaFunctionMap,
  type SimLambdaFunctionName,
  simLambdaFunctionArn,
} from "../../function/sim-lambda-function.js";
import { CreateFunctionAuthorizer } from "./create-function-authorizer.js";
import { requireCreateFunctionInput } from "./create-function-input.js";
import type {
  SimCreateFunctionCommand,
  SimCreateFunctionCommandOutput,
} from "./create-function.cmd.js";

interface CreateFunctionCommandHandlerProperties {
  accountRegionScope: SimAwsAccountRegionScope;
  functions: SimLambdaFunctionMap;
  runAsOwner: SimAwsRunAsOwner;
  iam?: SimIamInterServiceAuthZ;
  background?: BackgroundScheduler;
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

  constructor(properties: CreateFunctionCommandHandlerProperties) {
    const {
      accountRegionScope,
      functions,
      runAsOwner,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;
    this.accountRegionScope = accountRegionScope;
    this.functions = functions;
    this.runAsOwner = runAsOwner;
    this.authorizer = new CreateFunctionAuthorizer({ iam });
    this.background = background;
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
    this.authorizer.authorize(functionArn, options?.caller);

    if (this.functions.has(input.name as SimLambdaFunctionName)) {
      throw new SimLambdaResourceConflictException(
        `Function already exist: ${functionArn}`,
      );
    }

    const simFunction = new SimLambdaFunction({
      ...input,
      accountRegionScope: this.accountRegionScope,
      runAsOwner: this.runAsOwner,
    });

    this.functions.set(simFunction.name, simFunction);

    // New function becomes Active async in the background.
    this.background.schedule(() => simFunction.activate());

    return {
      $metadata: {},
      ...simFunction.configuration(),
    };
  }
}
