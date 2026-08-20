import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimLambdaEventInvokeConfigStore } from "../../function/event-invoke/sim-lambda-event-invoke-config-store.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import { DeleteFunctionEventInvokeConfigCommandHandler } from "../delete-function-event-invoke-config/delete-function-event-invoke-config.handler.js";
import type {
  SimDeleteFunctionEventInvokeConfigCommand,
  SimDeleteFunctionEventInvokeConfigCommandOutput,
} from "../delete-function-event-invoke-config/delete-function-event-invoke-config.command.js";
import { GetFunctionEventInvokeConfigCommandHandler } from "../get-function-event-invoke-config/get-function-event-invoke-config.handler.js";
import type {
  SimGetFunctionEventInvokeConfigCommand,
  SimGetFunctionEventInvokeConfigCommandOutput,
} from "../get-function-event-invoke-config/get-function-event-invoke-config.command.js";
import { ListFunctionEventInvokeConfigsCommandHandler } from "../list-function-event-invoke-configs/list-function-event-invoke-configs.handler.js";
import type {
  SimListFunctionEventInvokeConfigsCommand,
  SimListFunctionEventInvokeConfigsCommandOutput,
} from "../list-function-event-invoke-configs/list-function-event-invoke-configs.command.js";
import { PutFunctionEventInvokeConfigCommandHandler } from "../put-function-event-invoke-config/put-function-event-invoke-config.handler.js";
import type {
  SimPutFunctionEventInvokeConfigCommand,
  SimPutFunctionEventInvokeConfigCommandOutput,
} from "../put-function-event-invoke-config/put-function-event-invoke-config.command.js";
import { UpdateFunctionEventInvokeConfigCommandHandler } from "../update-function-event-invoke-config/update-function-event-invoke-config.handler.js";
import type {
  SimUpdateFunctionEventInvokeConfigCommand,
  SimUpdateFunctionEventInvokeConfigCommandOutput,
} from "../update-function-event-invoke-config/update-function-event-invoke-config.command.js";
import type { EventInvokeConfigCommandOptions } from "./event-invoke-config-request.js";

interface SimLambdaEventInvokeConfigCommandsProperties {
  readonly eventInvokeConfigs: SimLambdaEventInvokeConfigStore;
  readonly functions: SimLambdaFunctionLookup;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
}

/**
 * The event invoke config commands of one simulated Lambda scope.
 *
 * These five commands share the same collaborators and differ only in the
 * handler they run, so grouping them here keeps the SimLambda facade a thin
 * delegation rather than five near-identical wiring blocks.
 */
export class SimLambdaEventInvokeConfigCommands {
  private readonly properties: SimLambdaEventInvokeConfigCommandsProperties;

  constructor(properties: SimLambdaEventInvokeConfigCommandsProperties) {
    this.properties = properties;
  }

  /**
   * Write a function's whole event invoke config.
   */
  async put(
    command: SimPutFunctionEventInvokeConfigCommand,
    options?: EventInvokeConfigCommandOptions,
  ): Promise<SimPutFunctionEventInvokeConfigCommandOutput> {
    return await new PutFunctionEventInvokeConfigCommandHandler(
      this.properties,
    ).handle(command, options);
  }

  /**
   * Read a function's event invoke config.
   */
  async get(
    command: SimGetFunctionEventInvokeConfigCommand,
    options?: EventInvokeConfigCommandOptions,
  ): Promise<SimGetFunctionEventInvokeConfigCommandOutput> {
    return await new GetFunctionEventInvokeConfigCommandHandler(
      this.properties,
    ).handle(command, options);
  }

  /**
   * Change part of a function's event invoke config.
   */
  async update(
    command: SimUpdateFunctionEventInvokeConfigCommand,
    options?: EventInvokeConfigCommandOptions,
  ): Promise<SimUpdateFunctionEventInvokeConfigCommandOutput> {
    return await new UpdateFunctionEventInvokeConfigCommandHandler(
      this.properties,
    ).handle(command, options);
  }

  /**
   * Delete a function's event invoke config.
   */
  async delete(
    command: SimDeleteFunctionEventInvokeConfigCommand,
    options?: EventInvokeConfigCommandOptions,
  ): Promise<SimDeleteFunctionEventInvokeConfigCommandOutput> {
    return await new DeleteFunctionEventInvokeConfigCommandHandler(
      this.properties,
    ).handle(command, options);
  }

  /**
   * List every event invoke config a function holds.
   */
  async list(
    command: SimListFunctionEventInvokeConfigsCommand,
    options?: EventInvokeConfigCommandOptions,
  ): Promise<SimListFunctionEventInvokeConfigsCommandOutput> {
    return await new ListFunctionEventInvokeConfigsCommandHandler(
      this.properties,
    ).handle(command, options);
  }
}
