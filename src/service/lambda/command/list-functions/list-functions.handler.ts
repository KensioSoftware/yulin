import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import type { SimLambdaFunctionMap } from "../../function/sim-lambda-function.js";
import type { SimLambdaFunctionConfiguration } from "../../function/sim-lambda-function-configuration.js";
import type { SimLambdaFunctionVersionStore } from "../../function/version/sim-lambda-function-version-store.js";
import { ListFunctionsAuthorizer } from "./list-functions-authorizer.js";
import type {
  SimListFunctionsCommand,
  SimListFunctionsCommandOutput,
} from "./list-functions.command.js";

/**
 * What a caller asks for to have published versions listed alongside the
 * functions themselves.
 */
const allVersions = "ALL";

interface ListFunctionsCommandHandlerProperties {
  readonly functions: SimLambdaFunctionMap;
  readonly versions: SimLambdaFunctionVersionStore;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface ListFunctionsCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated Lambda ListFunctionsCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/ListFunctionsCommand/
 */
export class ListFunctionsCommandHandler implements CommandHandler<
  SimListFunctionsCommand,
  SimListFunctionsCommandOutput
> {
  private readonly functions: SimLambdaFunctionMap;
  private readonly versions: SimLambdaFunctionVersionStore;
  private readonly authorizer: ListFunctionsAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: ListFunctionsCommandHandlerProperties) {
    const {
      functions,
      versions,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;
    this.functions = functions;
    this.versions = versions;
    this.authorizer = new ListFunctionsAuthorizer({ iam });
    this.background = background;
  }

  /**
   * List the configuration of every sim Lambda function in this Account and
   * Region, as GetFunction reports one.
   */
  async handle(
    command: SimListFunctionsCommand,
    options?: ListFunctionsCommandHandlerOptions,
  ): Promise<SimListFunctionsCommandOutput> {
    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize(options?.caller);

    const listed = this.functions
      .values()
      .flatMap(
        (simFunction: SimLambdaFunction): readonly SimLambdaFunction[] =>
          command.input.FunctionVersion === allVersions
            ? this.versions.all(simFunction)
            : [simFunction],
      )
      .toArray();

    return {
      $metadata: {},
      Functions: listed.map((simFunction): SimLambdaFunctionConfiguration =>
        simFunction.configuration(),
      ),
    };
  }
}
