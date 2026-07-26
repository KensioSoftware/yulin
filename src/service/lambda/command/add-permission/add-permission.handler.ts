import type { CommandHandler } from "../../../../command/command-handler.js";
import type { BackgroundScheduler } from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import { SimLambdaPermission } from "../../function/policy/sim-lambda-permission.js";
import { FunctionUrlAuthorizer } from "../function-url/function-url-authorizer.js";
import type {
  SimAddPermissionCommand,
  SimAddPermissionCommandOutput,
} from "./add-permission.command.js";

interface AddPermissionCommandHandlerProperties {
  readonly functions: SimLambdaFunctionLookup;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
}

interface AddPermissionCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated Lambda AddPermissionCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/AddPermissionCommand/
 */
export class AddPermissionCommandHandler implements CommandHandler<
  SimAddPermissionCommand,
  SimAddPermissionCommandOutput
> {
  private readonly functions: SimLambdaFunctionLookup;
  private readonly authorizer: FunctionUrlAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: AddPermissionCommandHandlerProperties) {
    this.functions = properties.functions;
    this.authorizer = new FunctionUrlAuthorizer({
      iam: properties.iam,
      action: "lambda:AddPermission",
    });
    this.background = properties.background;
  }

  /**
   * Grant a permission on a sim Lambda function's resource policy.
   */
  async handle(
    command: SimAddPermissionCommand,
    options?: AddPermissionCommandHandlerOptions,
  ): Promise<SimAddPermissionCommandOutput> {
    const { input } = command;
    assertDefined(
      input.FunctionName,
      "AddPermissionCommand.input.FunctionName required",
    );
    assertDefined(
      input.StatementId,
      "AddPermissionCommand.input.StatementId required",
    );
    assertDefined(input.Action, "AddPermissionCommand.input.Action required");
    assertDefined(
      input.Principal,
      "AddPermissionCommand.input.Principal required",
    );

    await this.background.sequence();

    const functionName = input.FunctionName;
    this.authorizer.authorize(
      this.functions.functionArn(functionName),
      options?.caller,
    );
    const simFunction = this.functions.require(functionName);

    const permission = new SimLambdaPermission({
      statementId: input.StatementId,
      action: input.Action,
      principal: input.Principal,
      resourceArn: simFunction.arn,
      functionUrlAuthType: input.FunctionUrlAuthType,
      sourceArn: input.SourceArn,
      sourceAccount: input.SourceAccount,
      principalOrgId: input.PrincipalOrgID,
      invokedViaFunctionUrl: input.InvokedViaFunctionUrl,
    });

    simFunction.resourcePolicy.add(permission);

    return {
      $metadata: {},
      Statement: JSON.stringify(permission.toStatement()),
    };
  }
}
