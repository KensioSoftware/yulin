import type { SimCloudFrontRegistry } from "./sim-cloud-front-registry.js";
import { CreateDistributionCommandHandler } from "./command/create-distribution/create-distribution.handler.js";
import type {
  SimCloudFrontDistribution,
  SimCloudFrontDistributionId,
} from "./distribution/sim-cloudfront-distribution.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import type {
  CreateDistributionCommand,
  CreateDistributionCommandOutput,
} from "@aws-sdk/client-cloudfront";

/**
 * Simulated CloudFront. Handles SDK commands. Emulates AWS behaviour and state.
 */
export class SimCloudFront {
  private readonly distributions = new Map<
    SimCloudFrontDistributionId,
    SimCloudFrontDistribution
  >();

  constructor(
    private readonly accountRegionScope: SimAwsAccountRegionScope,
    private readonly cloudFrontRegistry: SimCloudFrontRegistry,
  ) {}

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
    );
    return await handler.handle(cmd);
  }
}
