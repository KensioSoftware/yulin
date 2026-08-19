import type { CommandHandler } from "../../../../command/command-handler.js";
import type { BackgroundScheduler } from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simLambdaQualifiedFunctionOf } from "../../function/sim-lambda-function-reference.js";
import type { SimLambdaFunctionVersionStore } from "../../function/version/sim-lambda-function-version-store.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import { FunctionUrlAuthorizer } from "../function-url/function-url-authorizer.js";
import type {
  SimRemovePermissionCommand,
  SimRemovePermissionCommandOutput,
} from "./remove-permission.command.js";

interface RemovePermissionCommandHandlerProperties {
  readonly functions: SimLambdaFunctionLookup;
  readonly versions: SimLambdaFunctionVersionStore;
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
  private readonly versions: SimLambdaFunctionVersionStore;
  private readonly authorizer: FunctionUrlAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: RemovePermissionCommandHandlerProperties) {
    this.functions = properties.functions;
    this.versions = properties.versions;
    this.authorizer = new FunctionUrlAuthorizer({
      iam: properties.iam,
      action: "lambda:RemovePermission",
    });
    this.background = properties.background;
  }

  /**
   * Revoke a permission from the resource policy of a sim Lambda function, or
   * of the version or alias a qualifier names.
   *
   * A statement is only ever revoked from the resource it was granted on, so a
   * statement id granted on an alias is not found on the function itself.
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

    const { functionName, qualifier } = simLambdaQualifiedFunctionOf(
      input.FunctionName,
      input.Qualifier,
    );
    this.authorizer.authorize(
      this.functions.functionArn(functionName, qualifier),
      options?.caller,
    );

    this.versions
      .requireResource(this.functions.require(functionName), qualifier)
      .resourcePolicy.remove(input.StatementId);

    return { $metadata: {} };
  }
}
