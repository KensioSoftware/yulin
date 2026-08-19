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
  SimGetAliasCommand,
  SimGetAliasCommandOutput,
} from "./get-alias.command.js";

interface GetAliasCommandHandlerProperties {
  readonly functions: SimLambdaFunctionLookup;
  readonly aliases: SimLambdaFunctionAliasStore;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface GetAliasCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated Lambda GetAliasCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/GetAliasCommand/
 */
export class GetAliasCommandHandler implements CommandHandler<
  SimGetAliasCommand,
  SimGetAliasCommandOutput
> {
  private readonly functions: SimLambdaFunctionLookup;
  private readonly aliases: SimLambdaFunctionAliasStore;
  private readonly authorizer: VersionAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: GetAliasCommandHandlerProperties) {
    const {
      functions,
      aliases,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;
    this.functions = functions;
    this.aliases = aliases;
    this.authorizer = new VersionAuthorizer({ iam, action: "lambda:GetAlias" });
    this.background = background;
  }

  /**
   * Read one of a sim Lambda function's aliases.
   */
  async handle(
    command: SimGetAliasCommand,
    options?: GetAliasCommandHandlerOptions,
  ): Promise<SimGetAliasCommandOutput> {
    const { input } = command;
    assertDefined(
      input.FunctionName,
      "GetAliasCommand.input.FunctionName required",
    );
    assertDefined(input.Name, "GetAliasCommand.input.Name required");

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const { functionName } = simLambdaFunctionReferenceOf(input.FunctionName);
    this.authorizer.authorize(
      this.functions.functionArn(functionName),
      options?.caller,
    );

    const alias = this.aliases.require(
      this.functions.require(functionName),
      input.Name,
    );

    return { $metadata: {}, ...alias.configuration() };
  }
}
