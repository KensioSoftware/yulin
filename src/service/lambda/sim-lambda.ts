import type { SimSdkCommandRouter } from "../../sdk/index.js";
import type { SimCfnServiceResourceFactory } from "../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import { SimLambdaCloudFormationResourceFactory } from "./cfn/sim-cfn-lambda-resource-factory.js";
import type { SimLambdaContainerImages } from "./function/code/image/sim-lambda-container-images.js";
import type { SimLambdaFunctionMap } from "./function/sim-lambda-function.js";
import type * as simLambdaCommands from "./command/sim-lambda-command.types.js";
import {
  SimLambdaCommands,
  type SimLambdaProperties,
} from "./sim-lambda-commands.js";
import { SimLambdaEventInvokeOperations } from "./sim-lambda-event-invoke-operations.js";
import type { SimLambdaRequestOptions } from "./sim-lambda-request-options.js";
import { SimLambdaSdkCommandRouter } from "./sdk/sim-lambda-sdk-command-router.js";

export type { SimLambdaRequestOptions } from "./sim-lambda-request-options.js";

/**
 * Simulated Lambda. Handles SDK commands. Emulates AWS behaviour and state.
 *
 * Each command below carries a one line doc comment rather than a block. This
 * file grows by one delegating method per simulated operation and is close to
 * the max-lines limit, which is the same reason `SimDynamoDb` reads that way.
 * The simulator's own accessors are held apart in `SimLambdaInspection`, and
 * the event invoke config commands in `SimLambdaEventInvokeOperations`, which
 * this extends.
 */
export class SimLambda extends SimLambdaEventInvokeOperations {
  protected readonly functions: SimLambdaFunctionMap = new Map();
  protected readonly commands: SimLambdaCommands;

  private readonly cfnFactory = new SimLambdaCloudFormationResourceFactory(
    this,
  );

  private readonly sdkRouter = new SimLambdaSdkCommandRouter(this);

  constructor(properties: SimLambdaProperties = {}) {
    super();
    this.commands = new SimLambdaCommands({
      ...properties,
      functions: this.functions,
      // Ambient execution-role callers are tracked per owning SimAws instance.
      // A standalone SimLambda is its own little universe, so it owns its own
      // ambient callers.
      runAsOwner: properties.runAsOwner ?? this,
    });
  }

  /**
   * Where this simulated Lambda resolves a container image URI to a real
   * in-process handler.
   *
   * Read by the CloudFormation Resource factory, which decides whether a
   * template's container image function can be created or has to be skipped.
   * @internal
   */
  containerImages(): SimLambdaContainerImages {
    return this.commands.containerImages;
  }

  /** Handle a Create Function Command from the SDK. */
  async createFunction(
    command: simLambdaCommands.SimCreateFunctionCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimCreateFunctionCommandOutput> {
    return await this.commands.functions.create(command, options);
  }

  /** Handle a Get Function Command from the SDK. */
  async getFunction(
    command: simLambdaCommands.SimGetFunctionCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimGetFunctionCommandOutput> {
    return await this.commands.functions.get(command, options);
  }

  /** Handle an Update Function Code Command from the SDK. */
  async updateFunctionCode(
    command: simLambdaCommands.SimUpdateFunctionCodeCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimUpdateFunctionCodeCommandOutput> {
    return await this.commands.functions.updateCode(command, options);
  }

  /** Handle an Update Function Configuration Command from the SDK. */
  async updateFunctionConfiguration(
    command: simLambdaCommands.SimUpdateFunctionConfigurationCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimUpdateFunctionConfigurationCommandOutput> {
    return await this.commands.functions.updateConfiguration(command, options);
  }

  /** Handle a List Functions Command from the SDK. */
  async listFunctions(
    command: simLambdaCommands.SimListFunctionsCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimListFunctionsCommandOutput> {
    return await this.commands.functions.list(command, options);
  }

  /** Handle a Delete Function Command from the SDK. */
  async deleteFunction(
    command: simLambdaCommands.SimDeleteFunctionCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimDeleteFunctionCommandOutput> {
    return await this.commands.functions.delete(command, options);
  }

  /** Handle an Invoke Command from the SDK. */
  async invoke(
    command: simLambdaCommands.SimInvokeCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimInvokeCommandOutput> {
    return await this.commands.functions.invoke(command, options);
  }

  /** Handle a Publish Version Command from the SDK. */
  async publishVersion(
    command: simLambdaCommands.SimPublishVersionCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimPublishVersionCommandOutput> {
    return await this.commands.versions.publish(command, options);
  }

  /** Handle a List Versions By Function Command from the SDK. */
  async listVersionsByFunction(
    command: simLambdaCommands.SimListVersionsByFunctionCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimListVersionsByFunctionCommandOutput> {
    return await this.commands.versions.list(command, options);
  }

  /** Handle a Create Alias Command from the SDK. */
  async createAlias(
    command: simLambdaCommands.SimCreateAliasCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimCreateAliasCommandOutput> {
    return await this.commands.aliases.create(command, options);
  }

  /** Handle an Update Alias Command from the SDK. */
  async updateAlias(
    command: simLambdaCommands.SimUpdateAliasCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimUpdateAliasCommandOutput> {
    return await this.commands.aliases.update(command, options);
  }

  /** Handle a Get Alias Command from the SDK. */
  async getAlias(
    command: simLambdaCommands.SimGetAliasCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimGetAliasCommandOutput> {
    return await this.commands.aliases.get(command, options);
  }

  /** Handle a List Aliases Command from the SDK. */
  async listAliases(
    command: simLambdaCommands.SimListAliasesCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimListAliasesCommandOutput> {
    return await this.commands.aliases.list(command, options);
  }

  /** Handle a Delete Alias Command from the SDK. */
  async deleteAlias(
    command: simLambdaCommands.SimDeleteAliasCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimDeleteAliasCommandOutput> {
    return await this.commands.aliases.delete(command, options);
  }

  /** Handle a Create Function Url Config Command from the SDK. */
  async createFunctionUrlConfig(
    command: simLambdaCommands.SimCreateFunctionUrlConfigCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimCreateFunctionUrlConfigCommandOutput> {
    return await this.commands.functionUrls.create(command, options);
  }

  /** Handle a Get Function Url Config Command from the SDK. */
  async getFunctionUrlConfig(
    command: simLambdaCommands.SimGetFunctionUrlConfigCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimGetFunctionUrlConfigCommandOutput> {
    return await this.commands.functionUrls.get(command, options);
  }

  /** Handle an Update Function Url Config Command from the SDK. */
  async updateFunctionUrlConfig(
    command: simLambdaCommands.SimUpdateFunctionUrlConfigCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimUpdateFunctionUrlConfigCommandOutput> {
    return await this.commands.functionUrls.update(command, options);
  }

  /** Handle a Delete Function Url Config Command from the SDK. */
  async deleteFunctionUrlConfig(
    command: simLambdaCommands.SimDeleteFunctionUrlConfigCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimDeleteFunctionUrlConfigCommandOutput> {
    return await this.commands.functionUrls.delete(command, options);
  }

  /** Handle a List Function Url Configs Command from the SDK. */
  async listFunctionUrlConfigs(
    command: simLambdaCommands.SimListFunctionUrlConfigsCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimListFunctionUrlConfigsCommandOutput> {
    return await this.commands.functionUrls.list(command, options);
  }

  /** Handle a Create Event Source Mapping Command from the SDK. */
  async createEventSourceMapping(
    command: simLambdaCommands.SimCreateEventSourceMappingCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimCreateEventSourceMappingCommandOutput> {
    return await this.commands.eventSourceMappings.create(command, options);
  }

  /** Handle a Get Event Source Mapping Command from the SDK. */
  async getEventSourceMapping(
    command: simLambdaCommands.SimGetEventSourceMappingCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimGetEventSourceMappingCommandOutput> {
    return await this.commands.eventSourceMappings.get(command, options);
  }

  /** Handle a List Event Source Mappings Command from the SDK. */
  async listEventSourceMappings(
    command: simLambdaCommands.SimListEventSourceMappingsCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimListEventSourceMappingsCommandOutput> {
    return await this.commands.eventSourceMappings.list(command, options);
  }

  /** Handle a Delete Event Source Mapping Command from the SDK. */
  async deleteEventSourceMapping(
    command: simLambdaCommands.SimDeleteEventSourceMappingCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimDeleteEventSourceMappingCommandOutput> {
    return await this.commands.eventSourceMappings.delete(command, options);
  }

  /** Handle an Add Permission Command from the SDK. */
  async addPermission(
    command: simLambdaCommands.SimAddPermissionCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimAddPermissionCommandOutput> {
    return await this.commands.permissions.add(command, options);
  }

  /** Handle a Remove Permission Command from the SDK. */
  async removePermission(
    command: simLambdaCommands.SimRemovePermissionCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimRemovePermissionCommandOutput> {
    return await this.commands.permissions.remove(command, options);
  }

  /** Handle a Get Policy Command from the SDK. */
  async getPolicy(
    command: simLambdaCommands.SimGetPolicyCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimGetPolicyCommandOutput> {
    return await this.commands.permissions.getPolicy(command, options);
  }

  /** Get this service's CloudFormation Resource factory. */
  cfnResourceFactory(): SimCfnServiceResourceFactory {
    return this.cfnFactory;
  }

  /** Get this service's SDK Command router for SDK client interception. */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
