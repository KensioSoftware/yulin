import type { CommandHandler } from "../../../../command/command-handler.js";
import type { BackgroundScheduler } from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import { FunctionUrlAuthorizer } from "../function-url/function-url-authorizer.js";
import type {
  SimRemovePermissionCommand,
  SimRemovePermissionCommandOutput,
} from "./remove-permission.command.js";

interface RemovePermissionCommandHandlerProperties {
  readonly functions: SimLambdaFunctionLookup;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
}

interface RemovePermissionCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated Lambda RemovePermissionCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/RemovePermissionCommand/
 */
export class RemovePermissionCommandHandler implements CommandHandler<
  SimRemovePermissionCommand,
  SimRemovePermissionCommandOutput
> {
  private readonly functions: SimLambdaFunctionLookup;
  private readonly authorizer: FunctionUrlAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: RemovePermissionCommandHandlerProperties) {
    this.functions = properties.functions;
    this.authorizer = new FunctionUrlAuthorizer({
      iam: properties.iam,
      action: "lambda:RemovePermission",
    });
    this.background = properties.background;
  }

  /**
   * Revoke a permission from a sim Lambda function's resource policy.
   */
  async handle(
    command: SimRemovePermissionCommand,
    options?: RemovePermissionCommandHandlerOptions,
  ): Promise<SimRemovePermissionCommandOutput> {
    const { input } = command;
    assertDefined(
      input.FunctionName,
      "RemovePermissionCommand.input.FunctionName required",
    );
    assertDefined(
      input.StatementId,
      "RemovePermissionCommand.input.StatementId required",
    );

    await this.background.sequence();

    const functionName = input.FunctionName;
    this.authorizer.authorize(
      this.functions.functionArn(functionName),
      options?.caller,
    );

    this.functions
      .require(functionName)
      .resourcePolicy.remove(input.StatementId);

    return { $metadata: {} };
  }
}
