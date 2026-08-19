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
import { simLambdaFunctionReferenceOf } from "../../function/sim-lambda-function-reference.js";
import type { SimLambdaFunctionAliasStore } from "../../function/version/sim-lambda-function-alias-store.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import { VersionAuthorizer } from "../version/version-authorizer.js";
import type {
  SimDeleteAliasCommand,
  SimDeleteAliasCommandOutput,
} from "./delete-alias.command.js";

interface DeleteAliasCommandHandlerProperties {
  readonly functions: SimLambdaFunctionLookup;
  readonly aliases: SimLambdaFunctionAliasStore;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface DeleteAliasCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated Lambda DeleteAliasCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/DeleteAliasCommand/
 */
export class DeleteAliasCommandHandler implements CommandHandler<
  SimDeleteAliasCommand,
  SimDeleteAliasCommandOutput
> {
  private readonly functions: SimLambdaFunctionLookup;
  private readonly aliases: SimLambdaFunctionAliasStore;
  private readonly authorizer: VersionAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: DeleteAliasCommandHandlerProperties) {
    const {
      functions,
      aliases,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;
    this.functions = functions;
    this.aliases = aliases;
    this.authorizer = new VersionAuthorizer({
      iam,
      action: "lambda:DeleteAlias",
    });
    this.background = background;
  }

  /**
   * Drop one of a sim Lambda function's aliases.
   *
   * The version the alias pointed at stays where it is, and stays invokable by
   * its number.
   */
  async handle(
    command: SimDeleteAliasCommand,
    options?: DeleteAliasCommandHandlerOptions,
  ): Promise<SimDeleteAliasCommandOutput> {
    const { input } = command;
    assertDefined(
      input.FunctionName,
      "DeleteAliasCommand.input.FunctionName required",
    );
    assertDefined(input.Name, "DeleteAliasCommand.input.Name required");

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const { functionName } = simLambdaFunctionReferenceOf(input.FunctionName);
    this.authorizer.authorize(
      this.functions.functionArn(functionName),
      options?.caller,
    );

    this.aliases.delete(this.functions.require(functionName), input.Name);

    return { $metadata: {} };
  }
}
