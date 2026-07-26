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
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import type { SimLambdaFunctionUrlStore } from "../../function/url/sim-lambda-function-url-store.js";
import { FunctionUrlAuthorizer } from "../function-url/function-url-authorizer.js";
import type {
  SimListFunctionUrlConfigsCommand,
  SimListFunctionUrlConfigsCommandOutput,
} from "./list-function-url-configs.command.js";

interface ListFunctionUrlConfigsCommandHandlerProperties {
  functionUrls: SimLambdaFunctionUrlStore;
  functions: SimLambdaFunctionLookup;
  iam?: SimIamInterServiceAuthZ;
  background?: BackgroundScheduler;
}

interface ListFunctionUrlConfigsCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated Lambda ListFunctionUrlConfigsCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/ListFunctionUrlConfigsCommand/
 */
export class ListFunctionUrlConfigsCommandHandler implements CommandHandler<
  SimListFunctionUrlConfigsCommand,
  SimListFunctionUrlConfigsCommandOutput
> {
  private readonly functionUrls: SimLambdaFunctionUrlStore;
  private readonly functions: SimLambdaFunctionLookup;
  private readonly authorizer: FunctionUrlAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: ListFunctionUrlConfigsCommandHandlerProperties) {
    const {
      functionUrls,
      functions,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;
    this.functionUrls = functionUrls;
    this.functions = functions;
    this.authorizer = new FunctionUrlAuthorizer({
      iam,
      action: "lambda:ListFunctionUrlConfigs",
    });
    this.background = background;
  }

  /**
   * List the Function URL configurations for a sim Lambda function.
   *
   * A function has at most one Function URL, so this returns either no
   * configurations or one.
   */
  async handle(
    command: SimListFunctionUrlConfigsCommand,
    options?: ListFunctionUrlConfigsCommandHandlerOptions,
  ): Promise<SimListFunctionUrlConfigsCommandOutput> {
    assertDefined(
      command.input.FunctionName,
      "ListFunctionUrlConfigsCommand.input.FunctionName required",
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const functionName = command.input.FunctionName;
    this.authorizer.authorize(
      this.functions.functionArn(functionName),
      options?.caller,
    );
    this.functions.require(functionName);

    return {
      $metadata: {},
      FunctionUrlConfigs: this.functionUrls
        .allForFunction(functionName)
        .map((functionUrl) => functionUrl.configuration()),
    };
  }
}
