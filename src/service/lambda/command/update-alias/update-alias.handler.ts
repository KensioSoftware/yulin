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
import { AliasInputParser } from "../alias/alias-input.js";
import { VersionAuthorizer } from "../version/version-authorizer.js";
import type {
  SimUpdateAliasCommand,
  SimUpdateAliasCommandOutput,
} from "./update-alias.command.js";

interface UpdateAliasCommandHandlerProperties {
  readonly functions: SimLambdaFunctionLookup;
  readonly aliases: SimLambdaFunctionAliasStore;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface UpdateAliasCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated Lambda UpdateAliasCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/UpdateAliasCommand/
 */
export class UpdateAliasCommandHandler implements CommandHandler<
  SimUpdateAliasCommand,
  SimUpdateAliasCommandOutput
> {
  private readonly functions: SimLambdaFunctionLookup;
  private readonly aliases: SimLambdaFunctionAliasStore;
  private readonly authorizer: VersionAuthorizer;
  private readonly background: BackgroundScheduler;
  private readonly inputParser = new AliasInputParser();

  constructor(properties: UpdateAliasCommandHandlerProperties) {
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
      action: "lambda:UpdateAlias",
    });
    this.background = background;
  }

  /**
   * Point an existing alias at another version, and describe it again.
   */
  async handle(
    command: SimUpdateAliasCommand,
    options?: UpdateAliasCommandHandlerOptions,
  ): Promise<SimUpdateAliasCommandOutput> {
    const { input } = command;
    assertDefined(
      input.FunctionName,
      "UpdateAliasCommand.input.FunctionName required",
    );
    assertDefined(input.Name, "UpdateAliasCommand.input.Name required");

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const { functionName } = simLambdaFunctionReferenceOf(input.FunctionName);
    this.authorizer.authorize(
      this.functions.functionArn(functionName),
      options?.caller,
    );

    const alias = this.aliases.update({
      simFunction: this.functions.require(functionName),
      name: input.Name,
      functionVersion: this.inputParser.parseOptionalFunctionVersion(
        input.FunctionVersion,
      ),
      description: input.Description,
    });

    return { $metadata: {}, ...alias.configuration() };
  }
}
