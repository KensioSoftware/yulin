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
import type { SimLambdaFunctionVersionStore } from "../../function/version/sim-lambda-function-version-store.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import { VersionAuthorizer } from "../version/version-authorizer.js";
import type {
  SimListVersionsByFunctionCommand,
  SimListVersionsByFunctionCommandOutput,
} from "./list-versions-by-function.command.js";

interface ListVersionsByFunctionCommandHandlerProperties {
  readonly functions: SimLambdaFunctionLookup;
  readonly versions: SimLambdaFunctionVersionStore;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface ListVersionsByFunctionCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated Lambda ListVersionsByFunctionCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/ListVersionsByFunctionCommand/
 */
export class ListVersionsByFunctionCommandHandler implements CommandHandler<
  SimListVersionsByFunctionCommand,
  SimListVersionsByFunctionCommandOutput
> {
  private readonly functions: SimLambdaFunctionLookup;
  private readonly versions: SimLambdaFunctionVersionStore;
  private readonly authorizer: VersionAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: ListVersionsByFunctionCommandHandlerProperties) {
    const {
      functions,
      versions,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;
    this.functions = functions;
    this.versions = versions;
    this.authorizer = new VersionAuthorizer({
      iam,
      action: "lambda:ListVersionsByFunction",
    });
    this.background = background;
  }

  /**
   * List a sim Lambda function's versions, which are `$LATEST` and each
   * version published from it, oldest first.
   */
  async handle(
    command: SimListVersionsByFunctionCommand,
    options?: ListVersionsByFunctionCommandHandlerOptions,
  ): Promise<SimListVersionsByFunctionCommandOutput> {
    assertDefined(
      command.input.FunctionName,
      "ListVersionsByFunctionCommand.input.FunctionName required",
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const { functionName } = simLambdaFunctionReferenceOf(
      command.input.FunctionName,
    );
    this.authorizer.authorize(
      this.functions.functionArn(functionName),
      options?.caller,
    );

    const versions = this.versions.all(this.functions.require(functionName));

    return {
      $metadata: {},
      Versions: versions.map((version) => version.configuration()),
    };
  }
}
