import { SimCloudFrontRegistry } from "./sim-cloud-front-registry.js";
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
} from "./origin/sim-cloudfront-s3-origin.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type {
  SimGetDistributionCommand,
  SimGetDistributionCommandOutput,
} from "./command/get-distribution/get-distribution.cmd.js";
import { GetDistributionCommandHandler } from "./command/get-distribution/get-distribution.handler.js";

/**
 * Simulated CloudFront. Handles SDK commands. Emulates AWS behaviour and state.
 */
export class SimCloudFront {
  private readonly distributions = new Map<
    SimCloudFrontDistributionId,
    SimCloudFrontDistribution
  >();

  constructor(
    private readonly accountRegionScope: SimAwsAccountRegionScope = simAwsAccountRegionScopeFactory.make(),
    private readonly cloudFrontRegistry: SimCloudFrontRegistry = new SimCloudFrontRegistry(),
    private readonly s3OriginResolver: SimCloudFrontS3OriginResolver = emptyCloudFrontS3OriginResolver,
    private readonly background: BackgroundScheduler = new BackgroundTasks(),
  ) {}

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
   * Handle a Create Distribution Command from the SDK.
   */
  async createDistribution(
    cmd: SimCreateDistributionCommand,
  ): Promise<SimCreateDistributionCommandOutput> {
    const handler = new CreateDistributionCommandHandler(
      this.accountRegionScope.accountId,
      this.distributions,
      this.cloudFrontRegistry,
      this.s3OriginResolver,
      this.background,
    );
    return await handler.handle(cmd);
  }

  /**
   * Handle a Get Distribution Command from the SDK.
   */
  async getDistribution(
    cmd: SimGetDistributionCommand,
  ): Promise<SimGetDistributionCommandOutput> {
    const handler = new GetDistributionCommandHandler(this.distributions);
    return await handler.handle(cmd);
  }
}
