import type { SimSdkCommandRouter } from "../../sdk/index.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimAwsCaller } from "../aws/caller/sim-aws-caller.js";
import type { SimAwsRunAsOwner } from "../aws/caller/sim-aws-run-as-context.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimCfnServiceResourceFactory } from "../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import { SimLambdaCloudFormationResourceFactory } from "./cfn/sim-cfn-lambda-resource-factory.js";
import type { SimLambdaCodeStore } from "./function/code/store/sim-lambda-code-store.js";
import type { SimLambdaVmSdkModuleProvider } from "./function/code/vm/sdk/sim-lambda-vm-sdk-module-provider.js";
import { SimLambdaEnvironmentConflicts } from "./function/environment/sim-lambda-environment-conflicts.js";
import { SimLambdaFunctionCommands } from "./command/function/sim-lambda-function-commands.js";
import type {
  SimLambdaFunction,
  SimLambdaFunctionMap,
  SimLambdaFunctionName,
} from "./function/sim-lambda-function.js";
import { SimLambdaFunctionUrlCommands } from "./command/function-url/sim-lambda-function-url-commands.js";
import { SimLambdaPermissionCommands } from "./command/permission/sim-lambda-permission-commands.js";
import type {
  SimAddPermissionCommand,
  SimAddPermissionCommandOutput,
  SimCreateFunctionCommand,
  SimCreateFunctionCommandOutput,
  SimCreateFunctionUrlConfigCommand,
  SimCreateFunctionUrlConfigCommandOutput,
  SimDeleteFunctionUrlConfigCommand,
  SimDeleteFunctionUrlConfigCommandOutput,
  SimGetFunctionCommand,
  SimGetFunctionCommandOutput,
  SimGetFunctionUrlConfigCommand,
  SimGetFunctionUrlConfigCommandOutput,
  SimGetPolicyCommand,
  SimGetPolicyCommandOutput,
  SimInvokeCommand,
  SimInvokeCommandOutput,
  SimListFunctionUrlConfigsCommand,
  SimListFunctionUrlConfigsCommandOutput,
  SimRemovePermissionCommand,
  SimRemovePermissionCommandOutput,
  SimUpdateFunctionUrlConfigCommand,
  SimUpdateFunctionUrlConfigCommandOutput,
} from "./command/sim-lambda-command.types.js";
import { SimLambdaFunctionLookup } from "./function/url/sim-lambda-function-lookup.js";
import { SimLambdaFunctionUrlStore } from "./function/url/sim-lambda-function-url-store.js";
import type {
  SimLambdaFunctionUrl,
  SimLambdaFunctionUrlId,
} from "./function/url/sim-lambda-function-url.js";
import { SimLambdaUrlRegistry } from "./registry/sim-lambda-url-registry.js";
import { SimLambdaSdkCommandRouter } from "./sdk/sim-lambda-sdk-command-router.js";

export interface SimLambdaRequestOptions {
  readonly caller?: SimAwsCaller;
}

interface SimLambdaProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
  readonly runAsOwner?: SimAwsRunAsOwner;
  readonly codeStore?: SimLambdaCodeStore;
  readonly vmSdkModuleProvider?: SimLambdaVmSdkModuleProvider;
  readonly urlRegistry?: SimLambdaUrlRegistry;
}

/**
 * Simulated Lambda. Handles SDK commands. Emulates AWS behaviour and state.
 */
export class SimLambda {
  private readonly functions: SimLambdaFunctionMap = new Map();
  private readonly functionUrls: SimLambdaFunctionUrlStore;
  private readonly functionLookup: SimLambdaFunctionLookup;
  private readonly functionCommands: SimLambdaFunctionCommands;
  private readonly functionUrlCommands: SimLambdaFunctionUrlCommands;
  private readonly permissionCommands: SimLambdaPermissionCommands;

  /**
   * Shared across function creations so a conflicting environment variable is
   * only reported once for this simulated Lambda.
   */
  private readonly environmentConflicts = new SimLambdaEnvironmentConflicts();

  private readonly cfnFactory = new SimLambdaCloudFormationResourceFactory(
    this,
  );
  private readonly sdkRouter = new SimLambdaSdkCommandRouter(this);

  constructor(properties: SimLambdaProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
      codeStore,
      vmSdkModuleProvider,
      // A standalone SimLambda is not reachable over HTTP, so its own
      // registry is enough; a SimAws-created one shares the environment-wide
      // registry the serving layer routes with.
      urlRegistry = new SimLambdaUrlRegistry(),
    } = properties;

    this.functionLookup = new SimLambdaFunctionLookup({
      accountRegionScope,
      functions: this.functions,
    });
    this.functionUrls = new SimLambdaFunctionUrlStore({
      accountRegionScope,
      urlRegistry,
      clock: background,
    });
    this.functionUrlCommands = new SimLambdaFunctionUrlCommands({
      functionUrls: this.functionUrls,
      functions: this.functionLookup,
      iam,
      background,
    });
    this.permissionCommands = new SimLambdaPermissionCommands({
      functions: this.functionLookup,
      iam,
      background,
    });
    this.functionCommands = new SimLambdaFunctionCommands({
      accountRegionScope,
      functions: this.functions,
      iam,
      background,
      // Ambient execution-role callers are tracked per owning SimAws instance.
      // A standalone SimLambda is its own little universe, so it owns its own
      // ambient callers.
      runAsOwner: properties.runAsOwner ?? this,
      environmentConflicts: this.environmentConflicts,
      codeStore,
      vmSdkModuleProvider,
    });
  }

  /**
   * Handle a Create Function Command from the SDK.
   */
  async createFunction(
    command: SimCreateFunctionCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<SimCreateFunctionCommandOutput> {
    return await this.functionCommands.create(command, options);
  }

  /**
   * Handle a Get Function Command from the SDK.
   */
  async getFunction(
    command: SimGetFunctionCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<SimGetFunctionCommandOutput> {
    return await this.functionCommands.get(command, options);
  }

  /**
   * Handle an Invoke Command from the SDK.
   */
  async invoke(
    command: SimInvokeCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<SimInvokeCommandOutput> {
    return await this.functionCommands.invoke(command, options);
  }

  /**
   * Handle a Create Function Url Config Command from the SDK.
   */
  async createFunctionUrlConfig(
    command: SimCreateFunctionUrlConfigCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<SimCreateFunctionUrlConfigCommandOutput> {
    return await this.functionUrlCommands.create(command, options);
  }

  /**
   * Handle a Get Function Url Config Command from the SDK.
   */
  async getFunctionUrlConfig(
    command: SimGetFunctionUrlConfigCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<SimGetFunctionUrlConfigCommandOutput> {
    return await this.functionUrlCommands.get(command, options);
  }

  /**
   * Handle an Update Function Url Config Command from the SDK.
   */
  async updateFunctionUrlConfig(
    command: SimUpdateFunctionUrlConfigCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<SimUpdateFunctionUrlConfigCommandOutput> {
    return await this.functionUrlCommands.update(command, options);
  }

  /**
   * Handle a Delete Function Url Config Command from the SDK.
   */
  async deleteFunctionUrlConfig(
    command: SimDeleteFunctionUrlConfigCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<SimDeleteFunctionUrlConfigCommandOutput> {
    return await this.functionUrlCommands.delete(command, options);
  }

  /**
   * Handle a List Function Url Configs Command from the SDK.
   */
  async listFunctionUrlConfigs(
    command: SimListFunctionUrlConfigsCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<SimListFunctionUrlConfigsCommandOutput> {
    return await this.functionUrlCommands.list(command, options);
  }

  /**
   * Handle an Add Permission Command from the SDK.
   */
  async addPermission(
    command: SimAddPermissionCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<SimAddPermissionCommandOutput> {
    return await this.permissionCommands.add(command, options);
  }

  /**
   * Handle a Remove Permission Command from the SDK.
   */
  async removePermission(
    command: SimRemovePermissionCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<SimRemovePermissionCommandOutput> {
    return await this.permissionCommands.remove(command, options);
  }

  /**
   * Handle a Get Policy Command from the SDK.
   */
  async getPolicy(
    command: SimGetPolicyCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<SimGetPolicyCommandOutput> {
    return await this.permissionCommands.getPolicy(command, options);
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
    return this.functionUrls.get(functionName);
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
    return this.functionUrls.byUrlId(urlId);
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
