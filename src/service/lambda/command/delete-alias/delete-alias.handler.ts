import type { SimLambdaFunctionUrlStore } from "../../function/url/sim-lambda-function-url-store.js";
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
import { simLambdaUnqualifiedFunctionOf } from "../../function/sim-lambda-function-reference.js";
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
  /** Where the alias's Function URL is held, which goes with the alias. */
  readonly functionUrls?: SimLambdaFunctionUrlStore | undefined;
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
  private readonly functionUrls: SimLambdaFunctionUrlStore | undefined;
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
    this.functionUrls = properties.functionUrls;
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

    const functionName = simLambdaUnqualifiedFunctionOf(input.FunctionName);
    this.authorizer.authorize(
      this.functions.functionArn(functionName),
      options?.caller,
    );

    const simFunction = this.functions.require(functionName);
    this.aliases.delete(simFunction, input.Name);
    // A Function URL on the alias goes with it.
    const functionUrl = this.functionUrls?.get(simFunction.name, input.Name);
    if (functionUrl !== undefined) {
      this.functionUrls?.delete(functionUrl);
    }

    return { $metadata: {} };
  }
}
