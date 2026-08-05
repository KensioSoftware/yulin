import type { SimSdkCommandRouter } from "../../sdk/index.js";
import type { SimAwsCaller } from "../aws/caller/sim-aws-caller.js";
import type { SimCfnServiceResourceFactory } from "../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import { SimLambdaCloudFormationResourceFactory } from "./cfn/sim-cfn-lambda-resource-factory.js";
import type { SimLambdaEventSourceMapping } from "./event-source/sim-lambda-event-source-mapping.js";
import type {
  SimLambdaFunction,
  SimLambdaFunctionMap,
  SimLambdaFunctionName,
} from "./function/sim-lambda-function.js";
import type {
  SimLambdaFunctionUrl,
  SimLambdaFunctionUrlId,
} from "./function/url/sim-lambda-function-url.js";
import type * as simLambdaCommands from "./command/sim-lambda-command.types.js";
import {
  SimLambdaCommands,
  type SimLambdaProperties,
} from "./sim-lambda-commands.js";
import { SimLambdaSdkCommandRouter } from "./sdk/sim-lambda-sdk-command-router.js";

export interface SimLambdaRequestOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated Lambda. Handles SDK commands. Emulates AWS behaviour and state.
 */
export class SimLambda {
  private readonly functions: SimLambdaFunctionMap = new Map();
  private readonly commands: SimLambdaCommands;

  private readonly cfnFactory = new SimLambdaCloudFormationResourceFactory(
    this,
  );
  private readonly sdkRouter = new SimLambdaSdkCommandRouter(this);

  constructor(properties: SimLambdaProperties = {}) {
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
   * Handle a Create Function Command from the SDK.
   */
  async createFunction(
    command: simLambdaCommands.SimCreateFunctionCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimCreateFunctionCommandOutput> {
    return await this.commands.functions.create(command, options);
  }

  /**
   * Handle a Get Function Command from the SDK.
   */
  async getFunction(
    command: simLambdaCommands.SimGetFunctionCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimGetFunctionCommandOutput> {
    return await this.commands.functions.get(command, options);
  }

  /**
   * Handle a Delete Function Command from the SDK.
   */
  async deleteFunction(
    command: simLambdaCommands.SimDeleteFunctionCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimDeleteFunctionCommandOutput> {
    return await this.commands.functions.delete(command, options);
  }

  /**
   * Handle an Invoke Command from the SDK.
   */
  async invoke(
    command: simLambdaCommands.SimInvokeCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimInvokeCommandOutput> {
    return await this.commands.functions.invoke(command, options);
  }

  /**
   * Handle a Create Function Url Config Command from the SDK.
   */
  async createFunctionUrlConfig(
    command: simLambdaCommands.SimCreateFunctionUrlConfigCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimCreateFunctionUrlConfigCommandOutput> {
    return await this.commands.functionUrls.create(command, options);
  }

  /**
   * Handle a Get Function Url Config Command from the SDK.
   */
  async getFunctionUrlConfig(
    command: simLambdaCommands.SimGetFunctionUrlConfigCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimGetFunctionUrlConfigCommandOutput> {
    return await this.commands.functionUrls.get(command, options);
  }

  /**
   * Handle an Update Function Url Config Command from the SDK.
   */
  async updateFunctionUrlConfig(
    command: simLambdaCommands.SimUpdateFunctionUrlConfigCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimUpdateFunctionUrlConfigCommandOutput> {
    return await this.commands.functionUrls.update(command, options);
  }

  /**
   * Handle a Delete Function Url Config Command from the SDK.
   */
  async deleteFunctionUrlConfig(
    command: simLambdaCommands.SimDeleteFunctionUrlConfigCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimDeleteFunctionUrlConfigCommandOutput> {
    return await this.commands.functionUrls.delete(command, options);
  }

  /**
   * Handle a List Function Url Configs Command from the SDK.
   */
  async listFunctionUrlConfigs(
    command: simLambdaCommands.SimListFunctionUrlConfigsCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimListFunctionUrlConfigsCommandOutput> {
    return await this.commands.functionUrls.list(command, options);
  }

  /**
   * Handle a Create Event Source Mapping Command from the SDK.
   */
  async createEventSourceMapping(
    command: simLambdaCommands.SimCreateEventSourceMappingCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimCreateEventSourceMappingCommandOutput> {
    return await this.commands.eventSourceMappings.create(command, options);
  }

  /**
   * Handle a Get Event Source Mapping Command from the SDK.
   */
  async getEventSourceMapping(
    command: simLambdaCommands.SimGetEventSourceMappingCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimGetEventSourceMappingCommandOutput> {
    return await this.commands.eventSourceMappings.get(command, options);
  }

  /**
   * Handle a List Event Source Mappings Command from the SDK.
   */
  async listEventSourceMappings(
    command: simLambdaCommands.SimListEventSourceMappingsCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimListEventSourceMappingsCommandOutput> {
    return await this.commands.eventSourceMappings.list(command, options);
  }

  /**
   * Handle a Delete Event Source Mapping Command from the SDK.
   */
  async deleteEventSourceMapping(
    command: simLambdaCommands.SimDeleteEventSourceMappingCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimDeleteEventSourceMappingCommandOutput> {
    return await this.commands.eventSourceMappings.delete(command, options);
  }

  /**
   * Handle an Add Permission Command from the SDK.
   */
  async addPermission(
    command: simLambdaCommands.SimAddPermissionCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimAddPermissionCommandOutput> {
    return await this.commands.permissions.add(command, options);
  }

  /**
   * Handle a Remove Permission Command from the SDK.
   */
  async removePermission(
    command: simLambdaCommands.SimRemovePermissionCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimRemovePermissionCommandOutput> {
    return await this.commands.permissions.remove(command, options);
  }

  /**
   * Handle a Get Policy Command from the SDK.
   */
  async getPolicy(
    command: simLambdaCommands.SimGetPolicyCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<simLambdaCommands.SimGetPolicyCommandOutput> {
    return await this.commands.permissions.getPolicy(command, options);
  }

  /**
   * Get a simulated event source mapping by its UUID.
   */
  getSimEventSourceMapping(
    uuid: string,
  ): SimLambdaEventSourceMapping | undefined {
    return this.commands.eventSourceMappings.find(uuid);
  }

  /**
   * Get a simulated Lambda function instance by name.
   */
  getSimFunctionByName(
    functionName: SimLambdaFunctionName | string,
  ): SimLambdaFunction | undefined {
    return this.functions.get(functionName as SimLambdaFunctionName);
  }

  /**
   * Get a simulated Lambda function's Function URL, if it has one.
   */
  getSimFunctionUrl(
    functionName: SimLambdaFunctionName | string,
  ): SimLambdaFunctionUrl | undefined {
    return this.commands.functionUrlStore.get(functionName);
  }

  /**
   * Get a simulated Lambda Function URL by the id in its hostname.
   *
   * This is how the localhost serving layer finds the Function URL a request
   * was addressed to, once the registry has named the owning Account.
   */
  getSimFunctionUrlById(
    urlId: SimLambdaFunctionUrlId,
  ): SimLambdaFunctionUrl | undefined {
    return this.commands.functionUrlStore.byUrlId(urlId);
  }

  /**
   * Get this service's CloudFormation Resource factory.
   */
  cfnResourceFactory(): SimCfnServiceResourceFactory {
    return this.cfnFactory;
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
