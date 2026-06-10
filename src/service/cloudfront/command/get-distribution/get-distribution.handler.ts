import type {
  SimGetDistributionCommand,
  SimGetDistributionCommandOutput,
} from "./get-distribution.cmd.js";
import type { CommandHandler } from "../../../../command/command-handler.js";
import { jitter } from "../../../../util/sleep.js";
import type {
  SimCloudFrontDistribution,
  SimCloudFrontDistributionId,
} from "../../distribution/sim-cloudfront-distribution.js";
import { SimCloudFrontResourceNotFoundException } from "../../error/sim-cloudfront.error.js";

interface GetDistributionCommandHandlerProps {
  readonly distributions: Map<
    SimCloudFrontDistributionId,
    SimCloudFrontDistribution
  >;
}

/**
 * CloudFront GetDistributionCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudfront/command/GetDistributionCommand/
 */
export class GetDistributionCommandHandler implements CommandHandler<
  SimGetDistributionCommand,
  SimGetDistributionCommandOutput
> {
  private readonly distributions: Map<
    SimCloudFrontDistributionId,
    SimCloudFrontDistribution
  >;

  constructor(props: GetDistributionCommandHandlerProps) {
    this.distributions = props.distributions;
  }

  /**
   * Handle getting a CloudFront Distribution.
   */
  async handle(
    cmd: SimGetDistributionCommand,
  ): Promise<SimGetDistributionCommandOutput> {
    if (cmd.input.Id === undefined) {
      throw new Error("GetDistributionCommand.input.Id is required");
    }
    const distributionId = cmd.input.Id as SimCloudFrontDistributionId;

    await jitter();

    const distribution = this.distributions.get(distributionId);
    if (distribution === undefined) {
      throw new SimCloudFrontResourceNotFoundException(
        `No sim CloudFront Distribution with ID ${distributionId}`,
      );
    }

    return {
      Distribution: {
        Id: distribution.distributionId,
        ARN: `arn:aws:cloudfront::${distribution.accountId}:distribution/${distribution.distributionId}`,
        Status: distribution.status,
        LastModifiedTime: distribution.lastModifiedTime,
        InProgressInvalidationBatches: 0,
        DomainName: `${distribution.distributionId.toLowerCase()}.cloudfront.net`,
        DistributionConfig: distribution.distributionConfig,
      },
      $metadata: {},
    };
  }
}
