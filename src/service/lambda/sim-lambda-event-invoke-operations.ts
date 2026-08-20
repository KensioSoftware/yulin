import type * as simLambdaCommands from "./command/sim-lambda-command.types.js";
import { SimLambdaInspection } from "./sim-lambda-inspection.js";
import type { SimLambdaRequestOptions } from "./sim-lambda-request-options.js";

/**
 * The event invoke config commands of the simulated Lambda facade.
 *
 * They sit here rather than on SimLambda itself because that file grows by one
 * delegating method per simulated operation and is at the length this codebase
 * allows. The five belong together, so they are the group that moved.
 */
export abstract class SimLambdaEventInvokeOperations extends SimLambdaInspection {
  /** Handle a Put Function Event Invoke Config Command from the SDK. */
  async putFunctionEventInvokeConfig(
    command: simLambdaCommands.SimPutFunctionEventInvokeConfigCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimPutFunctionEventInvokeConfigCommandOutput> {
    return await this.commands.eventInvokeConfigs.put(command, options);
  }

  /** Handle a Get Function Event Invoke Config Command from the SDK. */
  async getFunctionEventInvokeConfig(
    command: simLambdaCommands.SimGetFunctionEventInvokeConfigCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimGetFunctionEventInvokeConfigCommandOutput> {
    return await this.commands.eventInvokeConfigs.get(command, options);
  }

  /** Handle an Update Function Event Invoke Config Command from the SDK. */
  async updateFunctionEventInvokeConfig(
    command: simLambdaCommands.SimUpdateFunctionEventInvokeConfigCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimUpdateFunctionEventInvokeConfigCommandOutput> {
    return await this.commands.eventInvokeConfigs.update(command, options);
  }

  /** Handle a Delete Function Event Invoke Config Command from the SDK. */
  async deleteFunctionEventInvokeConfig(
    command: simLambdaCommands.SimDeleteFunctionEventInvokeConfigCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimDeleteFunctionEventInvokeConfigCommandOutput> {
    return await this.commands.eventInvokeConfigs.delete(command, options);
  }

  /** Handle a List Function Event Invoke Configs Command from the SDK. */
  async listFunctionEventInvokeConfigs(
    command: simLambdaCommands.SimListFunctionEventInvokeConfigsCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimListFunctionEventInvokeConfigsCommandOutput> {
    return await this.commands.eventInvokeConfigs.list(command, options);
  }
}
