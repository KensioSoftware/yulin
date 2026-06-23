import { SimCloudFrontRegistry } from "./registry/sim-cloud-front-registry.js";
import { CreateDistributionCommandHandler } from "./command/create-distribution/create-distribution.handler.js";
import type {
  SimCloudFrontDistribution,
  SimCloudFrontDistributionId,
} from "./distribution/sim-cloudfront-distribution.js";
import {
  type SimAwsAccountRegionScope,
  simAwsAccountRegionScopeFactory,
} from "../aws/sim-aws-account-region-scope.js";
import type {
  SimCreateDistributionCommand,
  SimCreateDistributionCommandOutput,
} from "./command/create-distribution/create-distribution.cmd.js";
import {
  emptyCloudFrontS3OriginResolver,
  type SimCloudFrontS3OriginResolver,
} from "./origin/s3/sim-cloudfront-s3-origin.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type {
  SimGetDistributionCommand,
  SimGetDistributionCommandOutput,
} from "./command/get-distribution/get-distribution.cmd.js";
import { GetDistributionCommandHandler } from "./command/get-distribution/get-distribution.handler.js";
import type {
  SimCreateFunctionCommand,
  SimCreateFunctionCommandOutput,
} from "./command/create-function/create-function.cmd.js";
import { CreateFunctionCommandHandler } from "./command/create-function/create-function.handler.js";
import type {
  SimCloudFrontFunction,
  SimCloudFrontFunctionName,
} from "./cff/sim-cloudfront-function.js";
import type { SimArn } from "../aws/arn.js";
import { assertDefined } from "../../util/type-guard/defined.js";
import { SimCloudFrontCloudFormationResourceFactory } from "./cfn/sim-cfn-cloudfront-resource-factory.js";
import type { SimCfnServiceResourceFactory } from "../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";

interface SimCloudFrontProps {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly cloudFrontRegistry?: SimCloudFrontRegistry;
  readonly s3OriginResolver?: SimCloudFrontS3OriginResolver;
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
  private readonly background: BackgroundScheduler;
  private readonly cfnFactory = new SimCloudFrontCloudFormationResourceFactory(
    this,
  );

  constructor(props: SimCloudFrontProps = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      cloudFrontRegistry = new SimCloudFrontRegistry(),
      s3OriginResolver = emptyCloudFrontS3OriginResolver,
      background = new BackgroundTasks(),
    } = props;

    this.accountRegionScope = accountRegionScope;
    this.cloudFrontRegistry = cloudFrontRegistry;
    this.s3OriginResolver = s3OriginResolver;
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
    cmd: SimCreateDistributionCommand,
  ): Promise<SimCreateDistributionCommandOutput> {
    const handler = new CreateDistributionCommandHandler({
      accountId: this.accountRegionScope.accountId,
      distributions: this.distributions,
      cloudFrontRegistry: this.cloudFrontRegistry,
      s3OriginResolver: this.s3OriginResolver,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Handle a Get Distribution Command from the SDK.
   */
  async getDistribution(
    cmd: SimGetDistributionCommand,
  ): Promise<SimGetDistributionCommandOutput> {
    const handler = new GetDistributionCommandHandler({
      distributions: this.distributions,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Handle a Create Function Command from the SDK.
   */
  async createFunction(
    cmd: SimCreateFunctionCommand,
  ): Promise<SimCreateFunctionCommandOutput> {
    const handler = new CreateFunctionCommandHandler({
      accountId: this.accountRegionScope.accountId,
      cloudFrontFunctions: this.cloudFrontFunctions,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Get a sim CloudFront Function by name.
   */
  getCloudFrontFunctionByArn(
    cloudFrontFunctionArn: SimArn,
  ): SimCloudFrontFunction | undefined {
    const arnAccountId = cloudFrontFunctionArn.split(":")[4];
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
}
