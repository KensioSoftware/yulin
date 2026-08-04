import { SimCloudFrontRegistry } from "./registry/sim-cloud-front-registry.js";
import { CreateDistributionCommandHandler } from "./command/create-distribution/create-distribution.handler.js";
import type {
  SimCloudFrontDistribution,
  SimCloudFrontDistributionId,
} from "./distribution/sim-cloudfront-distribution.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import type {
  SimCreateDistributionCommand,
  SimCreateDistributionCommandOutput,
} from "./command/create-distribution/create-distribution.command.js";
import {
  emptyCloudFrontS3OriginResolver,
  type SimCloudFrontS3OriginResolver,
} from "./origin/s3/sim-cloudfront-s3-origin.js";
import type { SimCfCustomOriginDispatcher } from "./origin/custom/sim-cf-custom-origin-dispatcher.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type {
  SimGetDistributionCommand,
  SimGetDistributionCommandOutput,
} from "./command/get-distribution/get-distribution.command.js";
import { GetDistributionCommandHandler } from "./command/get-distribution/get-distribution.handler.js";
import type {
  SimCreateFunctionCommand,
  SimCreateFunctionCommandOutput,
} from "./command/create-function/create-function.command.js";
import { CreateFunctionCommandHandler } from "./command/create-function/create-function.handler.js";
import type {
  SimCloudFrontFunction,
  SimCloudFrontFunctionName,
} from "./cff/sim-cloudfront-function.js";
import type { SimArn } from "../aws/arn.js";
import { assertDefined } from "../../util/type-guard/defined.js";
import { SimCloudFrontCloudFormationResourceFactory } from "./cfn/sim-cfn-cloudfront-resource-factory.js";
import type { SimCfnServiceResourceFactory } from "../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import type { SimAwsCaller } from "../aws/caller/sim-aws-caller.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimCloudFrontSdkCommandRouter } from "./sdk/sim-cloudfront-sdk-command-router.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type { SimAcmRegistry } from "../acm/registry/sim-acm-registry.js";

export interface SimCloudFrontRequestOptions {
  readonly caller?: SimAwsCaller;
}

interface SimCloudFrontProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly cloudFrontRegistry?: SimCloudFrontRegistry;
  readonly s3OriginResolver?: SimCloudFrontS3OriginResolver;
  readonly customOriginDispatcher?: SimCfCustomOriginDispatcher | undefined;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly acmRegistry?: SimAcmRegistry | undefined;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated CloudFront. Handles SDK commands. Emulates AWS behaviour and state.
 */
export class SimCloudFront {
  private readonly distributions = new Map<
    SimCloudFrontDistributionId,
    SimCloudFrontDistribution
  >();
  private readonly cloudFrontFunctions = new Map<
    SimCloudFrontFunctionName,
    SimCloudFrontFunction
  >();

  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly cloudFrontRegistry: SimCloudFrontRegistry;
  private readonly s3OriginResolver: SimCloudFrontS3OriginResolver;
  private readonly customOriginDispatcher:
    SimCfCustomOriginDispatcher | undefined;
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly acmRegistry: SimAcmRegistry | undefined;
  private readonly background: BackgroundScheduler;
  private readonly cfnFactory = new SimCloudFrontCloudFormationResourceFactory(
    this,
  );
  private readonly sdkRouter = new SimCloudFrontSdkCommandRouter(this);

  constructor(properties: SimCloudFrontProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      cloudFrontRegistry = new SimCloudFrontRegistry(),
      s3OriginResolver = emptyCloudFrontS3OriginResolver,
      customOriginDispatcher,
      iam = new SimIamAllowAllAuth(),
      acmRegistry,
      background = new BackgroundTasks(),
    } = properties;

    this.accountRegionScope = accountRegionScope;
    this.cloudFrontRegistry = cloudFrontRegistry;
    this.s3OriginResolver = s3OriginResolver;
    this.customOriginDispatcher = customOriginDispatcher;
    this.iam = iam;
    this.acmRegistry = acmRegistry;
    this.background = background;
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
    const handler = new CreateDistributionCommandHandler({
      accountId: this.accountRegionScope.accountId,
      distributions: this.distributions,
      cloudFrontRegistry: this.cloudFrontRegistry,
      s3OriginResolver: this.s3OriginResolver,
      customOriginDispatcher: this.customOriginDispatcher,
      iam: this.iam,
      acmRegistry: this.acmRegistry,
      background: this.background,
    });
    return await handler.handle(command, options);
  }

  /**
   * Handle a Get Distribution Command from the SDK.
   */
  async getDistribution(
    command: SimGetDistributionCommand,
    options?: SimCloudFrontRequestOptions,
  ): Promise<SimGetDistributionCommandOutput> {
    const handler = new GetDistributionCommandHandler({
      accountId: this.accountRegionScope.accountId,
      distributions: this.distributions,
      iam: this.iam,
      background: this.background,
    });
    return await handler.handle(command, options);
  }

  /**
   * Handle a Create Function Command from the SDK.
   */
  async createFunction(
    command: SimCreateFunctionCommand,
    options?: SimCloudFrontRequestOptions,
  ): Promise<SimCreateFunctionCommandOutput> {
    const handler = new CreateFunctionCommandHandler({
      accountId: this.accountRegionScope.accountId,
      cloudFrontFunctions: this.cloudFrontFunctions,
      iam: this.iam,
      background: this.background,
    });
    return await handler.handle(command, options);
  }

  /**
   * Get a sim CloudFront Function by name.
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
