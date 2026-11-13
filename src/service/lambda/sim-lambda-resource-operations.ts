import type * as simLambdaCommands from "./command/sim-lambda-command.types.js";
import { SimLambdaInspection } from "./sim-lambda-inspection.js";
import type { SimLambdaRequestOptions } from "./sim-lambda-request-options.js";

/**
 * The tagging, concurrency, account settings, configuration read and mapping
 * update commands of the simulated Lambda facade.
 *
 * They sit here rather than on SimLambda itself because that file grows by one
 * delegating method per simulated operation and is at the length this codebase
 * allows.
 */
export abstract class SimLambdaResourceOperations extends SimLambdaInspection {
  /** Handle a Get Account Settings Command from the SDK. */
  async getAccountSettings(
    command: simLambdaCommands.SimGetAccountSettingsCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimGetAccountSettingsCommandOutput> {
    return await this.commands.accountSettings.get(command, options);
  }

  /** Handle a Get Function Configuration Command from the SDK. */
  async getFunctionConfiguration(
    command: simLambdaCommands.SimGetFunctionConfigurationCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimGetFunctionConfigurationCommandOutput> {
    return await this.commands.functions.getConfiguration(command, options);
  }

  /** Handle a Tag Resource Command from the SDK. */
  async tagResource(
    command: simLambdaCommands.SimTagResourceCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimTagResourceCommandOutput> {
    return await this.commands.tags.tag(command, options);
  }

  /** Handle an Untag Resource Command from the SDK. */
  async untagResource(
    command: simLambdaCommands.SimUntagResourceCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimUntagResourceCommandOutput> {
    return await this.commands.tags.untag(command, options);
  }

  /** Handle a List Tags Command from the SDK. */
  async listTags(
    command: simLambdaCommands.SimListTagsCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimListTagsCommandOutput> {
    return await this.commands.tags.list(command, options);
  }

  /** Handle a Put Function Concurrency Command from the SDK. */
  async putFunctionConcurrency(
    command: simLambdaCommands.SimPutFunctionConcurrencyCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimPutFunctionConcurrencyCommandOutput> {
    return await this.commands.concurrency.put(command, options);
  }

  /** Handle a Get Function Concurrency Command from the SDK. */
  async getFunctionConcurrency(
    command: simLambdaCommands.SimGetFunctionConcurrencyCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimGetFunctionConcurrencyCommandOutput> {
    return await this.commands.concurrency.get(command, options);
  }

  /** Handle a Delete Function Concurrency Command from the SDK. */
  async deleteFunctionConcurrency(
    command: simLambdaCommands.SimDeleteFunctionConcurrencyCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimDeleteFunctionConcurrencyCommandOutput> {
    return await this.commands.concurrency.delete(command, options);
  }

  /** Handle a Put Function Recursion Config Command from the SDK. */
  async putFunctionRecursionConfig(
    command: simLambdaCommands.SimPutFunctionRecursionConfigCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimFunctionRecursionConfigCommandOutput> {
    return await this.commands.concurrency.putRecursionConfig(command, options);
  }

  /** Handle a Get Function Recursion Config Command from the SDK. */
  async getFunctionRecursionConfig(
    command: simLambdaCommands.SimGetFunctionRecursionConfigCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimFunctionRecursionConfigCommandOutput> {
    return await this.commands.concurrency.getRecursionConfig(command, options);
  }

  /** Handle an Update Event Source Mapping Command from the SDK. */
  async updateEventSourceMapping(
    command: simLambdaCommands.SimUpdateEventSourceMappingCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimUpdateEventSourceMappingCommandOutput> {
    return await this.commands.eventSourceMappings.update(command, options);
  }
}
