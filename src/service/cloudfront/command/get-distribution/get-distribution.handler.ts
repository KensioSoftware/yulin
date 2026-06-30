import type {
  SimGetDistributionCommand,
  SimGetDistributionCommandOutput,
} from "./get-distribution.cmd.js";
import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimCloudFrontDistribution,
  SimCloudFrontDistributionId,
} from "../../distribution/sim-cloudfront-distribution.js";
import { SimCloudFrontResourceNotFoundException } from "../../error/sim-cloudfront.error.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";

interface GetDistributionCommandHandlerProps {
  readonly distributions: Map<
    SimCloudFrontDistributionId,
    SimCloudFrontDistribution
  >;
  readonly background?: BackgroundScheduler;
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
  private readonly background: BackgroundScheduler;

  constructor(props: GetDistributionCommandHandlerProps) {
    const { distributions, background = new BackgroundTasks() } = props;
    this.distributions = distributions;
    this.background = background;
  }

  /**
   * Handle getting a CloudFront Distribution.
   */
  async handle(
    cmd: SimGetDistributionCommand,
  ): Promise<SimGetDistributionCommandOutput> {
    assertDefined(cmd.input.Id, "GetDistributionCommand.input.Id");
    const distributionId = cmd.input.Id as SimCloudFrontDistributionId;

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

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
