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
  SimCreateAliasCommand,
  SimCreateAliasCommandOutput,
} from "./create-alias.command.js";

interface CreateAliasCommandHandlerProperties {
  readonly functions: SimLambdaFunctionLookup;
  readonly aliases: SimLambdaFunctionAliasStore;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface CreateAliasCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated Lambda CreateAliasCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/CreateAliasCommand/
 */
export class CreateAliasCommandHandler implements CommandHandler<
  SimCreateAliasCommand,
  SimCreateAliasCommandOutput
> {
  private readonly functions: SimLambdaFunctionLookup;
  private readonly aliases: SimLambdaFunctionAliasStore;
  private readonly authorizer: VersionAuthorizer;
  private readonly background: BackgroundScheduler;
  private readonly inputParser = new AliasInputParser();

  constructor(properties: CreateAliasCommandHandlerProperties) {
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
      action: "lambda:CreateAlias",
    });
    this.background = background;
  }

  /**
   * Point a new alias at a published version of a sim Lambda function.
   */
  async handle(
    command: SimCreateAliasCommand,
    options?: CreateAliasCommandHandlerOptions,
  ): Promise<SimCreateAliasCommandOutput> {
    const { input } = command;
    assertDefined(
      input.FunctionName,
      "CreateAliasCommand.input.FunctionName required",
    );
    assertDefined(input.Name, "CreateAliasCommand.input.Name required");
    assertDefined(
      input.FunctionVersion,
      "CreateAliasCommand.input.FunctionVersion required",
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const { functionName } = simLambdaFunctionReferenceOf(input.FunctionName);
    this.authorizer.authorize(
      this.functions.functionArn(functionName),
      options?.caller,
    );

    const alias = this.aliases.create({
      simFunction: this.functions.require(functionName),
      name: input.Name,
      functionVersion: this.inputParser.requireFunctionVersion(
        input.FunctionVersion,
      ),
      description: input.Description,
    });

    return { $metadata: {}, ...alias.configuration() };
  }
}
