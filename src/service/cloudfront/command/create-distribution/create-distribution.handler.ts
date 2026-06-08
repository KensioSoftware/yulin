import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  CreateDistributionCommand,
  CreateDistributionCommandOutput,
} from "@aws-sdk/client-cloudfront";
import type { SimCloudFrontRegistry } from "../../sim-cloud-front-registry.js";
import { jitter } from "../../../../util/sleep.js";
import {
  SimCloudFrontDistribution,
  type SimCloudFrontDistributionId,
} from "../../distribution/sim-cloudfront-distribution.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";

/**
 * CloudFront CreateDistributionCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudfront/command/CreateDistributionCommand/
 */
export class CreateDistributionCommandHandler implements CommandHandler<
  CreateDistributionCommand,
  CreateDistributionCommandOutput
> {
  constructor(
    private readonly accountId: SimAwsAccountId,
    private readonly distributions: Map<
      SimCloudFrontDistributionId,
      SimCloudFrontDistribution
    >,
    private readonly cloudFrontRegistry: SimCloudFrontRegistry,
  ) {}

  /**
   * Handle creation of a new CloudFront Distribution.
   */
  async handle(
    cmd: CreateDistributionCommand,
  ): Promise<CreateDistributionCommandOutput> {
    await jitter();

    const distribution = new SimCloudFrontDistribution();

    this.distributions.set(distribution.distributionId, distribution);
    this.cloudFrontRegistry.registerDistribution(
      distribution.distributionId,
      this.accountId,
    );

    return {
      Distribution: {
        Id: distribution.distributionId,
        ARN: `arn:aws:cloudfront::${this.accountId}:distribution/${distribution.distributionId}`,
        Status: "Deployed",
        LastModifiedTime: new Date(),
        InProgressInvalidationBatches: 0,
        DomainName: `${distribution.distributionId.toLowerCase()}.cloudfront.net`,
        DistributionConfig: cmd.input.DistributionConfig,
      },
      Location: `https://cloudfront.amazonaws.com/2020-05-31/distribution/${distribution.distributionId}`,
      $metadata: {},
    };
  }
}
