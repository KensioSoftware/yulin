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
  SimListAliasesCommand,
  SimListAliasesCommandOutput,
} from "./list-aliases.command.js";

interface ListAliasesCommandHandlerProperties {
  readonly functions: SimLambdaFunctionLookup;
  readonly aliases: SimLambdaFunctionAliasStore;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface ListAliasesCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated Lambda ListAliasesCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/ListAliasesCommand/
 */
export class ListAliasesCommandHandler implements CommandHandler<
  SimListAliasesCommand,
  SimListAliasesCommandOutput
> {
  private readonly functions: SimLambdaFunctionLookup;
  private readonly aliases: SimLambdaFunctionAliasStore;
  private readonly authorizer: VersionAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: ListAliasesCommandHandlerProperties) {
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
      action: "lambda:ListAliases",
    });
    this.background = background;
  }

  /**
   * List a sim Lambda function's aliases, or the ones pointing at one of its
   * versions.
   */
  async handle(
    command: SimListAliasesCommand,
    options?: ListAliasesCommandHandlerOptions,
  ): Promise<SimListAliasesCommandOutput> {
    const { input } = command;
    assertDefined(
      input.FunctionName,
      "ListAliasesCommand.input.FunctionName required",
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const functionName = simLambdaUnqualifiedFunctionOf(input.FunctionName);
    this.authorizer.authorize(
      this.functions.functionArn(functionName),
      options?.caller,
    );

    const aliases = this.aliases.all(
      this.functions.require(functionName),
      input.FunctionVersion,
    );

    return {
      $metadata: {},
      Aliases: aliases.map((alias) => alias.configuration()),
    };
  }
}
