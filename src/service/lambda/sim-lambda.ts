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
}

/**
 * Simulated Lambda. Handles SDK commands. Emulates AWS behaviour and state.
 */
export class SimLambda {
  private readonly functions: SimLambdaFunctionMap = new Map();

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
    } = properties;

    this.accountRegionScope = accountRegionScope;
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
   * Get a simulated Lambda function instance by name.
   */
  getSimFunctionByName(
    functionName: SimLambdaFunctionName | string,
  ): SimLambdaFunction | undefined {
    return this.functions.get(functionName as SimLambdaFunctionName);
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
