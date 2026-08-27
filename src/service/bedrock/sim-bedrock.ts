import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimIamInterServiceAuthZ } from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simIamInRegion } from "../iam/authorize/sim-iam-region-auth-z.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import { SimBedrockAuthorizer } from "./command/authorize/sim-bedrock-authorizer.js";
import type {
  SimConverseCommand,
  SimConverseCommandOutput,
} from "./command/converse/converse.command.js";
import type {
  SimConverseStreamCommand,
  SimConverseStreamCommandOutput,
} from "./command/converse/converse-stream.command.js";
import { SimBedrockConverseHandler } from "./command/converse/sim-bedrock-converse.js";
import { SimBedrockConverseStreamHandler } from "./command/converse/sim-bedrock-converse-stream.js";
import type {
  SimInvokeModelCommand,
  SimInvokeModelCommandOutput,
  SimInvokeModelWithResponseStreamCommand,
  SimInvokeModelWithResponseStreamCommandOutput,
} from "./command/invoke-model/invoke-model.command.js";
import { SimBedrockInvokeModelHandler } from "./command/invoke-model/sim-bedrock-invoke-model.js";
import { SimBedrockInvokeModelStreamHandler } from "./command/invoke-model/sim-bedrock-invoke-model-stream.js";
import type { SimBedrockRequestOptions } from "./command/sim-bedrock-request-options.js";
import { SimBedrockResponses } from "./response/sim-bedrock-responses.js";
import { SimBedrockSdkCommandRouter } from "./sdk/sim-bedrock-sdk-command-router.js";

interface SimBedrockProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated Amazon Bedrock. Handles SDK commands. Emulates AWS behaviour and
 * state.
 *
 * No model runs here. Bedrock is a service where the interesting behaviour is
 * not the call but what the call answers with, so the simulation answers from
 * responses declared against a prompt or a model, in the way simulated
 * Rekognition answers a detection from results declared against an image. A
 * test says what the model says, and the system under test makes the same
 * calls it would make against AWS.
 *
 * One accessor covers Bedrock. The runtime commands are here, and the control
 * plane reaches the same service when it arrives.
 */
export class SimBedrock {
  private readonly responseRules = new SimBedrockResponses();
  private readonly converseCommand: SimBedrockConverseHandler;
  private readonly converseStreamCommand: SimBedrockConverseStreamHandler;
  private readonly invokeModelCommand: SimBedrockInvokeModelHandler;
  private readonly invokeModelStreamCommand: SimBedrockInvokeModelStreamHandler;
  private readonly background: BackgroundScheduler;
  private readonly sdkRouter = new SimBedrockSdkCommandRouter(this);

  constructor(properties: SimBedrockProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      background = new BackgroundTasks(),
    } = properties;

    const iam = simIamInRegion(properties.iam, accountRegionScope.regionName);
    const commandProperties = {
      responses: this.responseRules,
      authorizer: new SimBedrockAuthorizer({ iam }),
      accountRegionScope,
    };

    this.background = background;
    this.converseCommand = new SimBedrockConverseHandler(commandProperties);
    this.converseStreamCommand = new SimBedrockConverseStreamHandler(
      commandProperties,
    );
    this.invokeModelCommand = new SimBedrockInvokeModelHandler(
      commandProperties,
    );
    this.invokeModelStreamCommand = new SimBedrockInvokeModelStreamHandler(
      commandProperties,
    );
  }

  /**
   * The responses this simulated Bedrock answers model invocations with.
   *
   * Every call answers with the built-in default until a rule says otherwise:
   *
   * ```typescript
   * simAws.bedrock().responses().onPrompt("Summarise entry 1042", {
   *   text: "Entry 1042 covers the tone sandhi rules.",
   * });
   * ```
   */
  responses(): SimBedrockResponses {
    return this.responseRules;
  }

  /**
   * Handle a Converse Command from the SDK.
   */
  async converse(
    command: SimConverseCommand,
    options?: SimBedrockRequestOptions,
  ): Promise<SimConverseCommandOutput> {
    await this.background.sequence();

    return this.converseCommand.handle(command, options);
  }

  /**
   * Handle a ConverseStream Command from the SDK.
   */
  async converseStream(
    command: SimConverseStreamCommand,
    options?: SimBedrockRequestOptions,
  ): Promise<SimConverseStreamCommandOutput> {
    await this.background.sequence();

    return this.converseStreamCommand.handle(command, options);
  }

  /**
   * Handle an InvokeModel Command from the SDK.
   */
  async invokeModel(
    command: SimInvokeModelCommand,
    options?: SimBedrockRequestOptions,
  ): Promise<SimInvokeModelCommandOutput> {
    await this.background.sequence();

    return this.invokeModelCommand.handle(command, options);
  }

  /**
   * Handle an InvokeModelWithResponseStream Command from the SDK.
   */
  async invokeModelWithResponseStream(
    command: SimInvokeModelWithResponseStreamCommand,
    options?: SimBedrockRequestOptions,
  ): Promise<SimInvokeModelWithResponseStreamCommandOutput> {
    await this.background.sequence();

    return this.invokeModelStreamCommand.handle(command, options);
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
