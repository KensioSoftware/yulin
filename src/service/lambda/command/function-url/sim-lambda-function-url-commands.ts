import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import type { SimLambdaFunctionUrlStore } from "../../function/url/sim-lambda-function-url-store.js";
import { CreateFunctionUrlConfigCommandHandler } from "../create-function-url-config/create-function-url-config.handler.js";
import type {
  SimCreateFunctionUrlConfigCommand,
  SimCreateFunctionUrlConfigCommandOutput,
} from "../create-function-url-config/create-function-url-config.command.js";
import { DeleteFunctionUrlConfigCommandHandler } from "../delete-function-url-config/delete-function-url-config.handler.js";
import type {
  SimDeleteFunctionUrlConfigCommand,
  SimDeleteFunctionUrlConfigCommandOutput,
} from "../delete-function-url-config/delete-function-url-config.command.js";
import { GetFunctionUrlConfigCommandHandler } from "../get-function-url-config/get-function-url-config.handler.js";
import type {
  SimGetFunctionUrlConfigCommand,
  SimGetFunctionUrlConfigCommandOutput,
} from "../get-function-url-config/get-function-url-config.command.js";
import { ListFunctionUrlConfigsCommandHandler } from "../list-function-url-configs/list-function-url-configs.handler.js";
import type {
  SimListFunctionUrlConfigsCommand,
  SimListFunctionUrlConfigsCommandOutput,
} from "../list-function-url-configs/list-function-url-configs.command.js";
import { UpdateFunctionUrlConfigCommandHandler } from "../update-function-url-config/update-function-url-config.handler.js";
import type {
  SimUpdateFunctionUrlConfigCommand,
  SimUpdateFunctionUrlConfigCommandOutput,
} from "../update-function-url-config/update-function-url-config.command.js";

interface SimLambdaFunctionUrlCommandsProperties {
  readonly functionUrls: SimLambdaFunctionUrlStore;
  readonly functions: SimLambdaFunctionLookup;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
}

interface SimLambdaFunctionUrlCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The Function URL config commands of one simulated Lambda scope.
 *
 * These five commands share the same collaborators and differ only in the
 * handler they run, so grouping them here keeps the SimLambda facade a thin
 * delegation rather than five near-identical wiring blocks.
 */
export class SimLambdaFunctionUrlCommands {
  private readonly properties: SimLambdaFunctionUrlCommandsProperties;

  constructor(properties: SimLambdaFunctionUrlCommandsProperties) {
    this.properties = properties;
  }

  /**
   * Create the Function URL for a function.
   */
  async create(
    command: SimCreateFunctionUrlConfigCommand,
    options?: SimLambdaFunctionUrlCommandOptions,
  ): Promise<SimCreateFunctionUrlConfigCommandOutput> {
    return await new CreateFunctionUrlConfigCommandHandler(
      this.properties,
    ).handle(command, options);
  }

  /**
   * Get a function's Function URL configuration.
   */
  async get(
    command: SimGetFunctionUrlConfigCommand,
    options?: SimLambdaFunctionUrlCommandOptions,
  ): Promise<SimGetFunctionUrlConfigCommandOutput> {
    return await new GetFunctionUrlConfigCommandHandler(this.properties).handle(
      command,
      options,
    );
  }

  /**
   * Update a function's Function URL configuration.
   */
  async update(
    command: SimUpdateFunctionUrlConfigCommand,
    options?: SimLambdaFunctionUrlCommandOptions,
  ): Promise<SimUpdateFunctionUrlConfigCommandOutput> {
    return await new UpdateFunctionUrlConfigCommandHandler(
      this.properties,
    ).handle(command, options);
  }

  /**
   * Delete a function's Function URL.
   */
  async delete(
    command: SimDeleteFunctionUrlConfigCommand,
    options?: SimLambdaFunctionUrlCommandOptions,
  ): Promise<SimDeleteFunctionUrlConfigCommandOutput> {
    return await new DeleteFunctionUrlConfigCommandHandler(
      this.properties,
    ).handle(command, options);
  }

  /**
   * List a function's Function URL configurations.
   */
  async list(
    command: SimListFunctionUrlConfigsCommand,
    options?: SimLambdaFunctionUrlCommandOptions,
  ): Promise<SimListFunctionUrlConfigsCommandOutput> {
    return await new ListFunctionUrlConfigsCommandHandler(
      this.properties,
    ).handle(command, options);
  }
}
