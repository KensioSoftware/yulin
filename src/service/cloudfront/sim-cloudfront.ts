import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import type { SimArn } from "../aws/arn.js";
import type { SimCfnServiceResourceFactory } from "../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type {
  SimCloudFrontFunction,
  SimCloudFrontFunctionName,
} from "./cff/sim-cloudfront-function.js";
import { SimCloudFrontCloudFormationResourceFactory } from "./cfn/sim-cfn-cloudfront-resource-factory.js";
import type {
  SimCreateDistributionCommand,
  SimCreateDistributionCommandOutput,
} from "./command/create-distribution/create-distribution.command.js";
import type {
  SimCreateFunctionCommand,
  SimCreateFunctionCommandOutput,
} from "./command/create-function/create-function.command.js";
import type { SimCloudFrontFunctionMap } from "./command/create-function/create-function.handler.js";
import type {
  SimDeleteDistributionCommand,
  SimDeleteDistributionCommandOutput,
} from "./command/delete-distribution/delete-distribution.command.js";
import type {
  SimDeleteFunctionCommand,
  SimDeleteFunctionCommandOutput,
} from "./command/delete-function/delete-function.command.js";
import type {
  SimDescribeFunctionCommand,
  SimDescribeFunctionCommandOutput,
  SimGetFunctionCommand,
  SimGetFunctionCommandOutput,
  SimListFunctionsCommand,
  SimListFunctionsCommandOutput,
} from "./command/function/sim-cf-function-command.types.js";
import type {
  SimGetDistributionCommand,
  SimGetDistributionCommandOutput,
} from "./command/get-distribution/get-distribution.command.js";
import type {
  SimUpdateDistributionCommand,
  SimUpdateDistributionCommandOutput,
} from "./command/update-distribution/update-distribution.command.js";
import type {
  SimCloudFrontDistribution,
  SimCloudFrontDistributionId,
} from "./distribution/sim-cloudfront-distribution.js";
import { SimCloudFrontPolicies } from "./sim-cloudfront-policies.js";
import type {
  SimCloudFrontOriginAccessControl,
  SimCloudFrontOriginAccessControlId,
} from "./origin-access-control/sim-cf-origin-access-control.js";
import { SimCloudFrontOriginAccessControlRegistry } from "./origin-access-control/sim-cf-origin-access-control-registry.js";
import type { SimCfKeyValueStoreCommands } from "./key-value-store/sim-cf-key-value-store-commands.js";
import type { SimCloudFrontKeyValueStoreApi } from "./sim-cloudfront-key-value-store.js";
import { simCffNameInArn } from "./cff/sim-cff-arn.js";
import { SimCloudFrontSdkCommandRouter } from "./sdk/sim-cloudfront-sdk-command-router.js";
import {
  SimCloudFrontCommands,
  type SimCloudFrontDistributionMap,
  type SimCloudFrontProperties,
  type SimCloudFrontRequestOptions,
} from "./sim-cloudfront-commands.js";

export type {
  SimCloudFrontProperties,
  SimCloudFrontRequestOptions,
} from "./sim-cloudfront-commands.js";

/**
 * Simulated CloudFront. Handles SDK commands. Emulates AWS behaviour and state.
 */
export class SimCloudFront extends SimCloudFrontPolicies {
  private readonly distributions: SimCloudFrontDistributionMap = new Map();
  private readonly cloudFrontFunctions: SimCloudFrontFunctionMap = new Map();
  private readonly originAccessControls =
    new SimCloudFrontOriginAccessControlRegistry();

  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly commands: SimCloudFrontCommands;
  private readonly cfnFactory = new SimCloudFrontCloudFormationResourceFactory(
    this,
  );
  private readonly sdkRouter = new SimCloudFrontSdkCommandRouter(this);

  constructor(properties: SimCloudFrontProperties = {}) {
    super();
    this.accountRegionScope =
      properties.accountRegionScope ?? simAwsAccountRegionScopeFactory.make();
    this.commands = new SimCloudFrontCommands({
      ...properties,
      accountId: this.accountRegionScope.accountId,
      distributions: this.distributions,
      cloudFrontFunctions: this.cloudFrontFunctions,
      originAccessControls: this.originAccessControls,
      responseHeadersPolicies: this.responseHeadersPolicies,
      cachePolicies: this.cachePolicies,
      originRequestPolicies: this.originRequestPolicies,
    });
  }

  /**
   * The key value store commands, and the stores they work on.
   */
  keyValueStores(): SimCfKeyValueStoreCommands {
    return this.commands.keyValueStores;
  }

  /**
   * The key value store data API over this sim CloudFront's stores.
   *
   * This is what the separate `@aws-sdk/client-cloudfront-keyvaluestore`
   * client talks to, reached from SimAws as `cloudFrontKeyValueStore()`.
   */
  keyValueStoreApi(): SimCloudFrontKeyValueStoreApi {
    return this.commands.keyValueStoreApi;
  }

  /**
   * Get the simulated Distributions owned by this sim CloudFront service.
   */
  getDistributions(): ReadonlyMap<
    SimCloudFrontDistributionId,
    SimCloudFrontDistribution
  > {
    return this.distributions;
  }

  /**
   * Get a simulated CloudFront Distribution by ID.
   */
  getSimDistributionById(
    distributionId: SimCloudFrontDistributionId | string,
  ): SimCloudFrontDistribution | undefined {
    return this.distributions.get(
      distributionId as SimCloudFrontDistributionId,
    );
  }

  /**
   * Handle a Create Distribution Command from the SDK.
   */
  async createDistribution(
    command: SimCreateDistributionCommand,
    options?: SimCloudFrontRequestOptions,
  ): Promise<SimCreateDistributionCommandOutput> {
    return await this.commands.createDistribution(command, options);
  }

  /**
   * Handle a Get Distribution Command from the SDK.
   */
  async getDistribution(
    command: SimGetDistributionCommand,
    options?: SimCloudFrontRequestOptions,
  ): Promise<SimGetDistributionCommandOutput> {
    return await this.commands.getDistribution(command, options);
  }

  /**
   * Handle an Update Distribution Command from the SDK.
   */
  async updateDistribution(
    command: SimUpdateDistributionCommand,
    options?: SimCloudFrontRequestOptions,
  ): Promise<SimUpdateDistributionCommandOutput> {
    return await this.commands.updateDistribution(command, options);
  }

  /**
   * Handle a Delete Distribution Command from the SDK.
   */
  async deleteDistribution(
    command: SimDeleteDistributionCommand,
    options?: SimCloudFrontRequestOptions,
  ): Promise<SimDeleteDistributionCommandOutput> {
    return await this.commands.deleteDistribution(command, options);
  }

  /**
   * Handle a Create Function Command from the SDK.
   */
  async createFunction(
    command: SimCreateFunctionCommand,
    options?: SimCloudFrontRequestOptions,
  ): Promise<SimCreateFunctionCommandOutput> {
    return await this.commands.functions.createFunction(command, options);
  }

  /**
   * Handle a Delete Function Command from the SDK.
   */
  async deleteFunction(
    command: SimDeleteFunctionCommand,
    options?: SimCloudFrontRequestOptions,
  ): Promise<SimDeleteFunctionCommandOutput> {
    return await this.commands.functions.deleteFunction(command, options);
  }

  /**
   * Handle a List Functions Command from the SDK.
   */
  async listFunctions(
    command: SimListFunctionsCommand,
    options?: SimCloudFrontRequestOptions,
  ): Promise<SimListFunctionsCommandOutput> {
    return await this.commands.functions.listFunctions(command, options);
  }

  /**
   * Handle a Describe Function Command from the SDK.
   */
  async describeFunction(
    command: SimDescribeFunctionCommand,
    options?: SimCloudFrontRequestOptions,
  ): Promise<SimDescribeFunctionCommandOutput> {
    return await this.commands.functions.describeFunction(command, options);
  }

  /**
   * Handle a Get Function Command from the SDK.
   */
  async getFunction(
    command: SimGetFunctionCommand,
    options?: SimCloudFrontRequestOptions,
  ): Promise<SimGetFunctionCommandOutput> {
    return await this.commands.functions.getFunction(command, options);
  }

  /**
   * Get a sim CloudFront Function by ARN.
   */
  getCloudFrontFunctionByArn(
    cloudFrontFunctionArn: SimArn,
  ): SimCloudFrontFunction | undefined {
    const name = simCffNameInArn(
      cloudFrontFunctionArn,
      this.accountRegionScope.accountId,
    );

    return name === undefined ? undefined : this.cloudFrontFunctions.get(name);
  }

  /**
   * Get a sim CloudFront Function by name.
   */
  getCloudFrontFunctionByName(
    cloudFrontFunctionName: SimCloudFrontFunctionName | string,
  ): SimCloudFrontFunction | undefined {
    return this.cloudFrontFunctions.get(
      cloudFrontFunctionName as SimCloudFrontFunctionName,
    );
  }

  /**
   * Store a simulated origin access control.
   *
   * There is no CreateOriginAccessControl command here, so CloudFormation is
   * the only thing that makes one, and this is how it hands it over. A name
   * another origin access control already holds is refused, as CloudFront
   * refuses one.
   */
  addOriginAccessControl(
    originAccessControl: SimCloudFrontOriginAccessControl,
  ): void {
    this.originAccessControls.add(originAccessControl);
  }

  /**
   * Forget a simulated origin access control.
   */
  removeOriginAccessControl(
    originAccessControlId: SimCloudFrontOriginAccessControlId,
  ): void {
    this.originAccessControls.remove(originAccessControlId);
  }

  /**
   * Get a simulated origin access control by ID.
   */
  getOriginAccessControlById(
    originAccessControlId: SimCloudFrontOriginAccessControlId | string,
  ): SimCloudFrontOriginAccessControl | undefined {
    return this.originAccessControls.byId(originAccessControlId);
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
