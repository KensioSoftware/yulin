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
  CreateDistributionCommand,
  CreateDistributionCommandOutput,
} from "@aws-sdk/client-cloudfront";
import {
  emptyCloudFrontS3OriginResolver,
  type SimCloudFrontS3OriginResolver,
} from "./origin/sim-cloudfront-s3-origin.js";

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
    cmd: CreateDistributionCommand,
  ): Promise<CreateDistributionCommandOutput> {
    const handler = new CreateDistributionCommandHandler(
      this.accountRegionScope.accountId,
      this.distributions,
      this.cloudFrontRegistry,
      this.s3OriginResolver,
    );
    return await handler.handle(cmd);
  }
}
