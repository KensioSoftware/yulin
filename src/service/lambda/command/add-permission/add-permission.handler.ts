import type { CommandHandler } from "../../../../command/command-handler.js";
import type { BackgroundScheduler } from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simLambdaQualifiedFunctionOf } from "../../function/sim-lambda-function-reference.js";
import type { SimLambdaFunctionVersionStore } from "../../function/version/sim-lambda-function-version-store.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import { SimLambdaPermission } from "../../function/policy/sim-lambda-permission.js";
import { FunctionUrlAuthorizer } from "../function-url/function-url-authorizer.js";
import type {
  SimAddPermissionCommand,
  SimAddPermissionCommandOutput,
} from "./add-permission.command.js";

interface AddPermissionCommandHandlerProperties {
  readonly functions: SimLambdaFunctionLookup;
  readonly versions: SimLambdaFunctionVersionStore;
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
  private readonly versions: SimLambdaFunctionVersionStore;
  private readonly authorizer: FunctionUrlAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: AddPermissionCommandHandlerProperties) {
    this.functions = properties.functions;
    this.versions = properties.versions;
    this.authorizer = new FunctionUrlAuthorizer({
      iam: properties.iam,
      action: "lambda:AddPermission",
    });
    this.background = properties.background;
  }

  /**
   * Grant a permission on the resource policy of a sim Lambda function, or of
   * the version or alias a qualifier names.
   *
   * The statement is held against the qualified resource and carries its ARN,
   * so a grant made on an alias admits a call through that alias alone.
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

    const { functionName, qualifier } = simLambdaQualifiedFunctionOf(
      input.FunctionName,
      input.Qualifier,
    );
    this.authorizer.authorize(
      this.functions.functionArn(functionName, qualifier),
      options?.caller,
    );
    const resource = this.versions.requireResource(
      this.functions.require(functionName),
      qualifier,
    );

    const permission = new SimLambdaPermission({
      statementId: input.StatementId,
      action: input.Action,
      principal: input.Principal,
      resourceArn: resource.arn,
      functionUrlAuthType: input.FunctionUrlAuthType,
      sourceArn: input.SourceArn,
      sourceAccount: input.SourceAccount,
      principalOrgId: input.PrincipalOrgID,
      invokedViaFunctionUrl: input.InvokedViaFunctionUrl,
    });

    resource.resourcePolicy.add(permission);

    return {
      $metadata: {},
      Statement: JSON.stringify(permission.toStatement()),
    };
  }
}
