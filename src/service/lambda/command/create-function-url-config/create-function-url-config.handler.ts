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
import { FunctionUrlInputParser } from "../function-url/function-url-input.js";
import type {
  SimCreateFunctionUrlConfigCommand,
  SimCreateFunctionUrlConfigCommandOutput,
} from "./create-function-url-config.command.js";

interface CreateFunctionUrlConfigCommandHandlerProperties {
  functionUrls: SimLambdaFunctionUrlStore;
  functions: SimLambdaFunctionLookup;
  iam?: SimIamInterServiceAuthZ;
  background?: BackgroundScheduler;
}

interface CreateFunctionUrlConfigCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated Lambda CreateFunctionUrlConfigCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/CreateFunctionUrlConfigCommand/
 */
export class CreateFunctionUrlConfigCommandHandler implements CommandHandler<
  SimCreateFunctionUrlConfigCommand,
  SimCreateFunctionUrlConfigCommandOutput
> {
  private readonly functionUrls: SimLambdaFunctionUrlStore;
  private readonly functions: SimLambdaFunctionLookup;
  private readonly authorizer: FunctionUrlAuthorizer;
  private readonly background: BackgroundScheduler;
  private readonly inputParser = new FunctionUrlInputParser();

  constructor(properties: CreateFunctionUrlConfigCommandHandlerProperties) {
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
      action: "lambda:CreateFunctionUrlConfig",
    });
    this.background = background;
  }

  /**
   * Create the Function URL for a sim Lambda function.
   */
  async handle(
    command: SimCreateFunctionUrlConfigCommand,
    options?: CreateFunctionUrlConfigCommandHandlerOptions,
  ): Promise<SimCreateFunctionUrlConfigCommandOutput> {
    assertDefined(
      command.input.FunctionName,
      "CreateFunctionUrlConfigCommand.input.FunctionName required",
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const functionName = command.input.FunctionName;
    this.authorizer.authorize(
      this.functions.functionArn(functionName),
      options?.caller,
    );

    const functionUrl = this.functionUrls.create({
      simFunction: this.functions.require(functionName),
      authType: this.inputParser.requireAuthType(command.input.AuthType),
      invokeMode: this.inputParser.parseOptionalInvokeMode(
        command.input.InvokeMode,
      ),
      cors: this.inputParser.parseOptionalCors(command.input.Cors),
    });

    return {
      $metadata: {},
      ...functionUrl.configuration(),
    };
  }
}
