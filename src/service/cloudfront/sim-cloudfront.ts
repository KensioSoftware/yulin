import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import type { SimArn } from "../aws/arn.js";
import { assertDefined } from "../../util/type-guard/defined.js";
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
import type {
  SimCloudFrontResponseHeadersPolicy,
  SimCloudFrontResponseHeadersPolicyId,
} from "./response-headers-policy/sim-cf-response-headers-policy.js";
import { SimCloudFrontResponseHeadersPolicyRegistry } from "./response-headers-policy/sim-cf-response-headers-policy-registry.js";
import type {
  SimCloudFrontOriginAccessControl,
  SimCloudFrontOriginAccessControlId,
} from "./origin-access-control/sim-cf-origin-access-control.js";
import { SimCloudFrontOriginAccessControlRegistry } from "./origin-access-control/sim-cf-origin-access-control-registry.js";
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
export class SimCloudFront {
  private readonly distributions: SimCloudFrontDistributionMap = new Map();
  private readonly cloudFrontFunctions: SimCloudFrontFunctionMap = new Map();
  private readonly responseHeadersPolicies =
    new SimCloudFrontResponseHeadersPolicyRegistry();
  private readonly originAccessControls =
    new SimCloudFrontOriginAccessControlRegistry();

  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly commands: SimCloudFrontCommands;
  private readonly cfnFactory = new SimCloudFrontCloudFormationResourceFactory(
    this,
  );
  private readonly sdkRouter = new SimCloudFrontSdkCommandRouter(this);

  constructor(properties: SimCloudFrontProperties = {}) {
    this.accountRegionScope =
      properties.accountRegionScope ?? simAwsAccountRegionScopeFactory.make();
    this.commands = new SimCloudFrontCommands({
      ...properties,
      accountId: this.accountRegionScope.accountId,
      distributions: this.distributions,
      cloudFrontFunctions: this.cloudFrontFunctions,
      originAccessControls: this.originAccessControls,
      responseHeadersPolicies: this.responseHeadersPolicies,
    });
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
    return await this.commands.createFunction(command, options);
  }

  /**
   * Handle a Delete Function Command from the SDK.
   */
  async deleteFunction(
    command: SimDeleteFunctionCommand,
    options?: SimCloudFrontRequestOptions,
  ): Promise<SimDeleteFunctionCommandOutput> {
    return await this.commands.deleteFunction(command, options);
  }

  /**
   * Get a sim CloudFront Function by ARN.
   */
  getCloudFrontFunctionByArn(
    cloudFrontFunctionArn: SimArn,
  ): SimCloudFrontFunction | undefined {
    const arnAccountId = cloudFrontFunctionArn.split(":", 5)[4];
    if (arnAccountId !== this.accountRegionScope.accountId) {
      return undefined;
    }
    const cloudFrontFunctionName = cloudFrontFunctionArn.split("/").pop();
    assertDefined(
      cloudFrontFunctionName,
      `CloudFront Function name in ARN ${cloudFrontFunctionArn}`,
    );
    return this.cloudFrontFunctions.get(
      cloudFrontFunctionName as SimCloudFrontFunctionName,
    );
  }

  /**
   * Get a sim CloudFront Function by name.
   */
  getCloudFrontFunctionByName(
    cloudFrontFunctionName: SimCloudFrontFunctionName,
  ): SimCloudFrontFunction | undefined {
    return this.cloudFrontFunctions.get(cloudFrontFunctionName);
  }

  /**
   * Store a simulated response headers policy.
   *
   * There is no CreateResponseHeadersPolicy command here, so CloudFormation is
   * the only thing that makes one, and this is how it hands the policy over.
   * A name another policy already holds is refused, as CloudFront refuses one.
   */
  addResponseHeadersPolicy(policy: SimCloudFrontResponseHeadersPolicy): void {
    this.responseHeadersPolicies.add(policy);
  }

  /**
   * Forget a simulated response headers policy.
   */
  removeResponseHeadersPolicy(
    policyId: SimCloudFrontResponseHeadersPolicyId,
  ): void {
    this.responseHeadersPolicies.remove(policyId);
  }

  /**
   * Get a simulated response headers policy by ID.
   */
  getResponseHeadersPolicyById(
    policyId: SimCloudFrontResponseHeadersPolicyId | string,
  ): SimCloudFrontResponseHeadersPolicy | undefined {
    return this.responseHeadersPolicies.byId(policyId);
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
