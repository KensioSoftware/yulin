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
import { SimLambdaCodeResolver } from "../../function/code/sim-lambda-code-resolver.js";
import type { SimLambdaContainerImages } from "../../function/code/image/sim-lambda-container-images.js";
import type { SimLambdaCodeStore } from "../../function/code/store/sim-lambda-code-store.js";
import type { SimLambdaVmSdkModuleProvider } from "../../function/code/vm/sdk/sim-lambda-vm-sdk-module-provider.js";
import type { SimLambdaOutboundHttp } from "../../function/outbound/sim-lambda-outbound-http.js";
import { simLambdaUnqualifiedFunctionOf } from "../../function/sim-lambda-function-reference.js";
import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import type { SimLambdaFunctionVersionStore } from "../../function/version/sim-lambda-function-version-store.js";
import { UpdateFunctionCodeAuthorizer } from "./update-function-code-authorizer.js";
import { requireUpdateFunctionCodeInput } from "./update-function-code-input.js";
import type {
  SimUpdateFunctionCodeCommand,
  SimUpdateFunctionCodeCommandOutput,
} from "./update-function-code.command.js";

interface UpdateFunctionCodeCommandHandlerProperties {
  readonly functions: SimLambdaFunctionLookup;
  readonly versions: SimLambdaFunctionVersionStore;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
  readonly codeStore?: SimLambdaCodeStore | undefined;
  readonly containerImages?: SimLambdaContainerImages | undefined;
  readonly vmSdkModuleProvider?: SimLambdaVmSdkModuleProvider | undefined;
  readonly outboundHttp?: SimLambdaOutboundHttp | undefined;
}

interface UpdateFunctionCodeCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated Lambda UpdateFunctionCodeCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/UpdateFunctionCodeCommand/
 */
export class UpdateFunctionCodeCommandHandler implements CommandHandler<
  SimUpdateFunctionCodeCommand,
  SimUpdateFunctionCodeCommandOutput
> {
  private readonly functions: SimLambdaFunctionLookup;
  private readonly versions: SimLambdaFunctionVersionStore;
  private readonly authorizer: UpdateFunctionCodeAuthorizer;
  private readonly background: BackgroundScheduler;
  private readonly codeResolver: SimLambdaCodeResolver;

  constructor(properties: UpdateFunctionCodeCommandHandlerProperties) {
    const {
      functions,
      versions,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
      codeStore,
      containerImages,
      vmSdkModuleProvider,
      outboundHttp,
    } = properties;
    this.functions = functions;
    this.versions = versions;
    this.authorizer = new UpdateFunctionCodeAuthorizer({ iam });
    this.background = background;
    this.codeResolver = new SimLambdaCodeResolver({
      codeStore,
      containerImages,
      vmSdkModuleProvider,
      outboundHttp,
      // The background scheduler is this simulation's clock, and the same one
      // the function being updated was given.
      clock: background,
    });
  }

  /**
   * Replace the code a sim Lambda function runs.
   *
   * The function keeps its name, ARN, execution Role, resource-based policy,
   * Function URL, published versions and aliases. A version published before
   * this still runs the code it was published with.
   */
  async handle(
    command: SimUpdateFunctionCodeCommand,
    options?: UpdateFunctionCodeCommandHandlerOptions,
  ): Promise<SimUpdateFunctionCodeCommandOutput> {
    const input = requireUpdateFunctionCodeInput(command);

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const functionName = simLambdaUnqualifiedFunctionOf(input.name);
    this.authorizer.authorize(
      this.functions.functionArn(functionName),
      options?.caller,
    );

    const simFunction = this.functions.require(functionName);
    const code = await this.codeResolver.resolve(input.codeSource, {
      // The function's own handler name and environment stand, because
      // UpdateFunctionCode carries neither. UpdateFunctionConfiguration is
      // where those change.
      handlerName: simFunction.handlerName,
      environment: simFunction.environment,
      caller: options?.caller,
      missingHandlerMessage:
        `Function ${functionName} has no Handler to find zip code's export ` +
        "in. Set one with UpdateFunctionConfiguration first.",
    });

    simFunction.updateCode(code);

    return {
      $metadata: {},
      ...this.publishedOrUpdated(simFunction, input.publish).configuration(),
    };
  }

  /**
   * What the caller is answered with, which is a version of the updated code
   * where `Publish` asked for one.
   */
  private publishedOrUpdated(
    simFunction: SimLambdaFunction,
    publish: boolean,
  ): SimLambdaFunction {
    return publish ? this.versions.publish(simFunction) : simFunction;
  }
}
