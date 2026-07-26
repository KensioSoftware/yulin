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
import { CreateFunctionCommandHandler } from "./command/create-function/create-function.handler.js";
import type { SimLambdaCodeStore } from "./function/code/store/sim-lambda-code-store.js";
import type { SimLambdaVmSdkModuleProvider } from "./function/code/vm/sdk/sim-lambda-vm-sdk-module-provider.js";
import { SimLambdaEnvironmentConflicts } from "./function/environment/sim-lambda-environment-conflicts.js";
import type {
  SimLambdaFunction,
  SimLambdaFunctionMap,
  SimLambdaFunctionName,
} from "./function/sim-lambda-function.js";
import type {
  SimCreateFunctionCommand,
  SimCreateFunctionCommandOutput,
} from "./command/create-function/create-function.command.js";
import { GetFunctionCommandHandler } from "./command/get-function/get-function.handler.js";
import type {
  SimGetFunctionCommand,
  SimGetFunctionCommandOutput,
} from "./command/get-function/get-function.command.js";
import { InvokeCommandHandler } from "./command/invoke/invoke.handler.js";
import type {
  SimInvokeCommand,
  SimInvokeCommandOutput,
} from "./command/invoke/invoke.command.js";
import type {
  SimCreateFunctionUrlConfigCommand,
  SimCreateFunctionUrlConfigCommandOutput,
} from "./command/create-function-url-config/create-function-url-config.command.js";
import type {
  SimGetFunctionUrlConfigCommand,
  SimGetFunctionUrlConfigCommandOutput,
} from "./command/get-function-url-config/get-function-url-config.command.js";
import type {
  SimUpdateFunctionUrlConfigCommand,
  SimUpdateFunctionUrlConfigCommandOutput,
} from "./command/update-function-url-config/update-function-url-config.command.js";
import type {
  SimDeleteFunctionUrlConfigCommand,
  SimDeleteFunctionUrlConfigCommandOutput,
} from "./command/delete-function-url-config/delete-function-url-config.command.js";
import type {
  SimListFunctionUrlConfigsCommand,
  SimListFunctionUrlConfigsCommandOutput,
} from "./command/list-function-url-configs/list-function-url-configs.command.js";
import { SimLambdaFunctionUrlCommands } from "./command/function-url/sim-lambda-function-url-commands.js";
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
  private readonly functionUrlCommands: SimLambdaFunctionUrlCommands;

  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly background: BackgroundScheduler;
  private readonly runAsOwner: SimAwsRunAsOwner;
  private readonly codeStore: SimLambdaCodeStore | undefined;
  private readonly vmSdkModuleProvider:
    SimLambdaVmSdkModuleProvider | undefined;
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

    this.accountRegionScope = accountRegionScope;
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
    this.iam = iam;
    this.background = background;
    this.codeStore = codeStore;
    this.vmSdkModuleProvider = vmSdkModuleProvider;
    // Ambient execution-role callers are tracked per owning SimAws instance.
    // A standalone SimLambda is its own little universe, so it owns its own
    // ambient callers.
    this.runAsOwner = properties.runAsOwner ?? this;
  }

  /**
   * Handle a Create Function Command from the SDK.
   */
  async createFunction(
    command: SimCreateFunctionCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<SimCreateFunctionCommandOutput> {
    const handler = new CreateFunctionCommandHandler({
      accountRegionScope: this.accountRegionScope,
      functions: this.functions,
      runAsOwner: this.runAsOwner,
      iam: this.iam,
      background: this.background,
      codeStore: this.codeStore,
      vmSdkModuleProvider: this.vmSdkModuleProvider,
      environmentConflicts: this.environmentConflicts,
    });
    return await handler.handle(command, options);
  }

  /**
   * Handle a Get Function Command from the SDK.
   */
  async getFunction(
    command: SimGetFunctionCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<SimGetFunctionCommandOutput> {
    const handler = new GetFunctionCommandHandler({
      accountRegionScope: this.accountRegionScope,
      functions: this.functions,
      iam: this.iam,
      background: this.background,
    });
    return await handler.handle(command, options);
  }

  /**
   * Handle an Invoke Command from the SDK.
   */
  async invoke(
    command: SimInvokeCommand,
    options?: SimLambdaRequestOptions,
  ): Promise<SimInvokeCommandOutput> {
    const handler = new InvokeCommandHandler({
      accountRegionScope: this.accountRegionScope,
      functions: this.functions,
      iam: this.iam,
      background: this.background,
    });
    return await handler.handle(command, options);
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
