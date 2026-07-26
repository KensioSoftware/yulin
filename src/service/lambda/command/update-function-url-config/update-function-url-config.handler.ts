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
  SimUpdateFunctionUrlConfigCommand,
  SimUpdateFunctionUrlConfigCommandOutput,
} from "./update-function-url-config.command.js";

interface UpdateFunctionUrlConfigCommandHandlerProperties {
  functionUrls: SimLambdaFunctionUrlStore;
  functions: SimLambdaFunctionLookup;
  iam?: SimIamInterServiceAuthZ;
  background?: BackgroundScheduler;
}

interface UpdateFunctionUrlConfigCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated Lambda UpdateFunctionUrlConfigCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/UpdateFunctionUrlConfigCommand/
 */
export class UpdateFunctionUrlConfigCommandHandler implements CommandHandler<
  SimUpdateFunctionUrlConfigCommand,
  SimUpdateFunctionUrlConfigCommandOutput
> {
  private readonly functionUrls: SimLambdaFunctionUrlStore;
  private readonly functions: SimLambdaFunctionLookup;
  private readonly authorizer: FunctionUrlAuthorizer;
  private readonly background: BackgroundScheduler;
  private readonly inputParser = new FunctionUrlInputParser();

  constructor(properties: UpdateFunctionUrlConfigCommandHandlerProperties) {
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
      action: "lambda:UpdateFunctionUrlConfig",
    });
    this.background = background;
  }

  /**
   * Update the Function URL configuration for a sim Lambda function.
   */
  async handle(
    command: SimUpdateFunctionUrlConfigCommand,
    options?: UpdateFunctionUrlConfigCommandHandlerOptions,
  ): Promise<SimUpdateFunctionUrlConfigCommandOutput> {
    assertDefined(
      command.input.FunctionName,
      "UpdateFunctionUrlConfigCommand.input.FunctionName required",
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const functionName = command.input.FunctionName;
    this.authorizer.authorize(
      this.functions.functionArn(functionName),
      options?.caller,
    );
    const simFunction = this.functions.require(functionName);

    const functionUrl = this.functionUrls.require(simFunction);
    functionUrl.update({
      authType: this.inputParser.parseOptionalAuthType(command.input.AuthType),
      invokeMode: this.inputParser.parseOptionalInvokeMode(
        command.input.InvokeMode,
      ),
    });

    return {
      $metadata: {},
      ...functionUrl.configuration(),
    };
  }
}
