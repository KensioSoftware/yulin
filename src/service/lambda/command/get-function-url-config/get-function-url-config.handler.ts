import { simLambdaRequireFunctionUrl } from "../function-url/function-url-require.js";
import {
  simLambdaFunctionUrlOwner,
  simLambdaFunctionUrlReference,
} from "../function-url/function-url-reference.js";
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
  SimGetFunctionUrlConfigCommand,
  SimGetFunctionUrlConfigCommandOutput,
} from "./get-function-url-config.command.js";

interface GetFunctionUrlConfigCommandHandlerProperties {
  functionUrls: SimLambdaFunctionUrlStore;
  functions: SimLambdaFunctionLookup;
  iam?: SimIamInterServiceAuthZ;
  background?: BackgroundScheduler;
}

interface GetFunctionUrlConfigCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated Lambda GetFunctionUrlConfigCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/GetFunctionUrlConfigCommand/
 */
export class GetFunctionUrlConfigCommandHandler implements CommandHandler<
  SimGetFunctionUrlConfigCommand,
  SimGetFunctionUrlConfigCommandOutput
> {
  private readonly functionUrls: SimLambdaFunctionUrlStore;
  private readonly functions: SimLambdaFunctionLookup;
  private readonly authorizer: FunctionUrlAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: GetFunctionUrlConfigCommandHandlerProperties) {
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
      action: "lambda:GetFunctionUrlConfig",
    });
    this.background = background;
  }

  /**
   * Get the Function URL configuration for a sim Lambda function.
   */
  async handle(
    command: SimGetFunctionUrlConfigCommand,
    options?: GetFunctionUrlConfigCommandHandlerOptions,
  ): Promise<SimGetFunctionUrlConfigCommandOutput> {
    assertDefined(
      command.input.FunctionName,
      "GetFunctionUrlConfigCommand.input.FunctionName required",
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const reference = simLambdaFunctionUrlReference(
      command.input.FunctionName,
      command.input.Qualifier,
    );
    this.authorizer.authorize(
      this.functions.functionArn(reference.functionName, reference.qualifier),
      options?.caller,
    );
    const simFunction = simLambdaFunctionUrlOwner(this.functions, reference);

    return {
      $metadata: {},
      ...simLambdaRequireFunctionUrl(
        this.functionUrls,
        simFunction,
        reference.qualifier,
      ).configuration(),
    };
  }
}
