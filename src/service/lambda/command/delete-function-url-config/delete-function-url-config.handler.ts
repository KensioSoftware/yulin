import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import type { SimLambdaFunctionUrlStore } from "../../function/url/sim-lambda-function-url-store.js";
import { FunctionUrlAuthorizer } from "../function-url/function-url-authorizer.js";
import type {
  SimDeleteFunctionUrlConfigCommand,
  SimDeleteFunctionUrlConfigCommandOutput,
} from "./delete-function-url-config.command.js";

interface DeleteFunctionUrlConfigCommandHandlerProperties {
  functionUrls: SimLambdaFunctionUrlStore;
  functions: SimLambdaFunctionLookup;
  iam?: SimIamInterServiceAuthZ;
  background?: BackgroundScheduler;
}

interface DeleteFunctionUrlConfigCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated Lambda DeleteFunctionUrlConfigCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/DeleteFunctionUrlConfigCommand/
 */
export class DeleteFunctionUrlConfigCommandHandler implements CommandHandler<
  SimDeleteFunctionUrlConfigCommand,
  SimDeleteFunctionUrlConfigCommandOutput
> {
  private readonly functionUrls: SimLambdaFunctionUrlStore;
  private readonly functions: SimLambdaFunctionLookup;
  private readonly authorizer: FunctionUrlAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: DeleteFunctionUrlConfigCommandHandlerProperties) {
    const {
      functionUrls,
      functions,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;
    this.functionUrls = functionUrls;
    this.functions = functions;
    this.authorizer = new FunctionUrlAuthorizer({
      iam,
      action: "lambda:DeleteFunctionUrlConfig",
    });
    this.background = background;
  }

  /**
   * Delete the Function URL for a sim Lambda function.
   */
  async handle(
    command: SimDeleteFunctionUrlConfigCommand,
    options?: DeleteFunctionUrlConfigCommandHandlerOptions,
  ): Promise<SimDeleteFunctionUrlConfigCommandOutput> {
    assertDefined(
      command.input.FunctionName,
      "DeleteFunctionUrlConfigCommand.input.FunctionName required",
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const functionName = command.input.FunctionName;
    this.authorizer.authorize(
      this.functions.functionArn(functionName),
      options?.caller,
    );
    this.functionUrls.delete(this.functions.require(functionName));

    return { $metadata: {} };
  }
}
