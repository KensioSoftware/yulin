import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsRunAsOwner } from "../../../aws/caller/sim-aws-run-as-context.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimLambdaContainerImages } from "../../function/code/image/sim-lambda-container-images.js";
import type { SimLambdaCodeStore } from "../../function/code/store/sim-lambda-code-store.js";
import type { SimLambdaVmSdkModuleProvider } from "../../function/code/vm/sdk/sim-lambda-vm-sdk-module-provider.js";
import type { SimCloudWatchServiceWriter } from "../../../cloudwatch/write/sim-cloudwatch-service-writer.js";
import type { SimLambdaOutput } from "../../function/logging/sim-lambda-output.js";
import type { SimLogsServiceWriter } from "../../../logs/write/sim-logs-service-writer.js";
import type { SimLambdaOutboundHttp } from "../../function/outbound/sim-lambda-outbound-http.js";
import type { SimLambdaDestinationTargets } from "../../destination/sim-lambda-destination-targets.js";
import type { SimLambdaEnvironmentConflicts } from "../../function/environment/sim-lambda-environment-conflicts.js";
import type { SimLambdaEventInvokeConfigStore } from "../../function/event-invoke/sim-lambda-event-invoke-config-store.js";
import type { SimLambdaFunctionMap } from "../../function/sim-lambda-function.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import type { SimLambdaFunctionUrlStore } from "../../function/url/sim-lambda-function-url-store.js";
import type { SimLambdaFunctionVersionStore } from "../../function/version/sim-lambda-function-version-store.js";
import { CreateFunctionCommandHandler } from "../create-function/create-function.handler.js";
import type {
  SimCreateFunctionCommand,
  SimCreateFunctionCommandOutput,
} from "../create-function/create-function.command.js";
import { DeleteFunctionCommandHandler } from "../delete-function/delete-function.handler.js";
import type {
  SimDeleteFunctionCommand,
  SimDeleteFunctionCommandOutput,
} from "../delete-function/delete-function.command.js";
import { GetFunctionCommandHandler } from "../get-function/get-function.handler.js";
import type {
  SimGetFunctionCommand,
  SimGetFunctionCommandOutput,
} from "../get-function/get-function.command.js";
import { InvokeCommandHandler } from "../invoke/invoke.handler.js";
import type {
  SimInvokeCommand,
  SimInvokeCommandOutput,
} from "../invoke/invoke.command.js";
import { ListFunctionsCommandHandler } from "../list-functions/list-functions.handler.js";
import type {
  SimListFunctionsCommand,
  SimListFunctionsCommandOutput,
} from "../list-functions/list-functions.command.js";
import { UpdateFunctionCodeCommandHandler } from "../update-function-code/update-function-code.handler.js";
import type {
  SimUpdateFunctionCodeCommand,
  SimUpdateFunctionCodeCommandOutput,
} from "../update-function-code/update-function-code.command.js";
import { UpdateFunctionConfigurationCommandHandler } from "../update-function-configuration/update-function-configuration.handler.js";
import type {
  SimUpdateFunctionConfigurationCommand,
  SimUpdateFunctionConfigurationCommandOutput,
} from "../update-function-configuration/update-function-configuration.command.js";

interface SimLambdaFunctionCommandsProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly functions: SimLambdaFunctionMap;
  readonly functionLookup: SimLambdaFunctionLookup;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
  readonly runAsOwner: SimAwsRunAsOwner;
  readonly functionUrls: SimLambdaFunctionUrlStore;
  readonly versions: SimLambdaFunctionVersionStore;
  readonly environmentConflicts: SimLambdaEnvironmentConflicts;
  readonly eventInvokeConfigs: SimLambdaEventInvokeConfigStore;
  readonly destinations: SimLambdaDestinationTargets;
  readonly codeStore?: SimLambdaCodeStore | undefined;
  readonly containerImages?: SimLambdaContainerImages | undefined;
  readonly vmSdkModuleProvider?: SimLambdaVmSdkModuleProvider | undefined;
  readonly logs?: SimLogsServiceWriter | undefined;
  readonly output?: SimLambdaOutput | undefined;
  readonly metrics?: SimCloudWatchServiceWriter | undefined;
  readonly outboundHttp?: SimLambdaOutboundHttp | undefined;
}

interface SimLambdaFunctionCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The function lifecycle commands of one simulated Lambda scope.
 *
 * These share the same collaborators and differ only in the handler they run,
 * so grouping them keeps the SimLambda facade a thin delegation rather than
 * three separate wiring blocks.
 */
export class SimLambdaFunctionCommands {
  private readonly properties: SimLambdaFunctionCommandsProperties;

  constructor(properties: SimLambdaFunctionCommandsProperties) {
    this.properties = properties;
  }

  /**
   * Create a function.
   */
  async create(
    command: SimCreateFunctionCommand,
    options?: SimLambdaFunctionCommandOptions,
  ): Promise<SimCreateFunctionCommandOutput> {
    return await new CreateFunctionCommandHandler(this.properties).handle(
      command,
      options,
    );
  }

  /**
   * Read a function's configuration.
   */
  async get(
    command: SimGetFunctionCommand,
    options?: SimLambdaFunctionCommandOptions,
  ): Promise<SimGetFunctionCommandOutput> {
    return await new GetFunctionCommandHandler(this.properties).handle(
      command,
      options,
    );
  }

  /**
   * Replace the code a function runs.
   */
  async updateCode(
    command: SimUpdateFunctionCodeCommand,
    options?: SimLambdaFunctionCommandOptions,
  ): Promise<SimUpdateFunctionCodeCommandOutput> {
    const {
      functionLookup,
      versions,
      iam,
      background,
      codeStore,
      containerImages,
      vmSdkModuleProvider,
      outboundHttp,
    } = this.properties;

    return await new UpdateFunctionCodeCommandHandler({
      // The lookup rather than the map itself, because this command resolves
      // a name that may arrive as a function ARN.
      functions: functionLookup,
      versions,
      iam,
      background,
      codeStore,
      containerImages,
      vmSdkModuleProvider,
      outboundHttp,
    }).handle(command, options);
  }

  /**
   * Change a function's settings.
   */
  async updateConfiguration(
    command: SimUpdateFunctionConfigurationCommand,
    options?: SimLambdaFunctionCommandOptions,
  ): Promise<SimUpdateFunctionConfigurationCommandOutput> {
    const { functionLookup, functions, iam, background, environmentConflicts } =
      this.properties;

    return await new UpdateFunctionConfigurationCommandHandler({
      // The lookup rather than the map itself, because this command resolves
      // a name that may arrive as a function ARN. The map comes too, for the
      // environments a changed one is checked against.
      functions: functionLookup,
      functionMap: functions,
      iam,
      background,
      environmentConflicts,
    }).handle(command, options);
  }

  /**
   * List the functions that exist in this Account and Region.
   */
  async list(
    command: SimListFunctionsCommand,
    options?: SimLambdaFunctionCommandOptions,
  ): Promise<SimListFunctionsCommandOutput> {
    return await new ListFunctionsCommandHandler(this.properties).handle(
      command,
      options,
    );
  }

  /**
   * Delete a function, and the Function URL that belongs to it.
   */
  async delete(
    command: SimDeleteFunctionCommand,
    options?: SimLambdaFunctionCommandOptions,
  ): Promise<SimDeleteFunctionCommandOutput> {
    return await new DeleteFunctionCommandHandler(this.properties).handle(
      command,
      options,
    );
  }

  /**
   * Invoke a function, or the version a qualifier names.
   */
  async invoke(
    command: SimInvokeCommand,
    options?: SimLambdaFunctionCommandOptions,
  ): Promise<SimInvokeCommandOutput> {
    return await new InvokeCommandHandler(this.properties).handle(
      command,
      options,
    );
  }
}
