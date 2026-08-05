import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsRunAsOwner } from "../../../aws/caller/sim-aws-run-as-context.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimLambdaCodeStore } from "../../function/code/store/sim-lambda-code-store.js";
import type { SimLambdaVmSdkModuleProvider } from "../../function/code/vm/sdk/sim-lambda-vm-sdk-module-provider.js";
import type { SimLambdaEnvironmentConflicts } from "../../function/environment/sim-lambda-environment-conflicts.js";
import type { SimLambdaFunctionMap } from "../../function/sim-lambda-function.js";
import type { SimLambdaFunctionUrlStore } from "../../function/url/sim-lambda-function-url-store.js";
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

interface SimLambdaFunctionCommandsProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly functions: SimLambdaFunctionMap;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
  readonly runAsOwner: SimAwsRunAsOwner;
  readonly functionUrls: SimLambdaFunctionUrlStore;
  readonly environmentConflicts: SimLambdaEnvironmentConflicts;
  readonly codeStore?: SimLambdaCodeStore | undefined;
  readonly vmSdkModuleProvider?: SimLambdaVmSdkModuleProvider | undefined;
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
   * Invoke a function.
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
